using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// The admin's household-wide notification relays that the website shows
/// in Settings › Integrations › Household channels
/// (components/notification-channel-cards.tsx): Telegram, Pushover and
/// email. Every notification the admin gets is also sent to each one
/// connected. Hidden for a member and on a server older than 0.36, whose
/// <c>GET /settings/integrations</c> has none of the three.
/// </summary>
public sealed partial class NotificationChannelsViewModel : ObservableObject
{
    public NotificationChannelsViewModel(AppModel model)
    {
        Telegram = new TelegramChannelViewModel(model);
        Pushover = new PushoverChannelViewModel(model);
        Email = new EmailChannelViewModel(model);
    }

    /// <summary>The section shows: the viewer is the admin and the server has the three channels.</summary>
    [ObservableProperty]
    private bool isVisible;

    public TelegramChannelViewModel Telegram { get; }
    public PushoverChannelViewModel Pushover { get; }
    public EmailChannelViewModel Email { get; }

    /// <summary>Fills the cards from <c>GET /settings/integrations</c>; an older server hides the section.</summary>
    internal void Apply(IntegrationsOverview overview)
    {
        if (overview is not { Telegram: { } telegram, Pushover: { } pushover, Email: { } email })
        {
            IsVisible = false;
            return;
        }
        Telegram.Apply(telegram);
        Pushover.Apply(pushover);
        Email.Apply(email);
        IsVisible = true;
    }
}

/// <summary>
/// One channel card: the "Connected" pill, "Test &amp; save" (the server
/// sends a test before saving and answers 400 with its reason when the test
/// fails), the success line, and "Remove …" once connected. A secret already
/// saved can be left blank to keep it.
/// </summary>
public abstract partial class ChannelCardViewModel : ObservableObject
{
    /// <summary>The website's placeholder for a saved secret.</summary>
    public static string KeepSavedPlaceholder => Loc.Get("Channels_KeepSavedPlaceholder");

    protected ChannelCardViewModel(AppModel model)
    {
        Model = model;
    }

    /// <summary>"Remove Telegram", …: the Remove button once connected.</summary>
    protected abstract string RemoveText { get; }

    /// <summary>The notice after "Test &amp; save" worked.</summary>
    protected abstract string SuccessText { get; }

    protected AppModel Model { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    [NotifyPropertyChangedFor(nameof(SecretPlaceholder))]
    private bool isConnected;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isSaving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RemoveLabel))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isRemoving;

    /// <summary>"Test &amp; save" failed: the server's message.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    /// <summary>"Connected — check the chat for a test message.", after a save.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNotice))]
    private string? notice;

    /// <summary>"Remove …" failed.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasRemoveError))]
    private string? removeError;

    /// <summary>"Connected" while connected; empty (the pill collapses) otherwise.</summary>
    public string ConnectedBadge => IsConnected ? Loc.Get("Channels_Connected") : "";
    public BadgeTone ConnectedTone { get; } = BadgeTone.Owned;

    public string SaveLabel => IsSaving ? Loc.Get("Channels_Testing") : Loc.Get("Channels_TestAndSave");
    public string RemoveLabel => IsRemoving ? Loc.Get("Channels_Removing") : RemoveText;
    public bool CanSave => !IsSaving && !IsRemoving;
    public bool CanRemove => IsConnected && !IsSaving && !IsRemoving;
    public bool HasError => Error != null;
    public bool HasNotice => Notice != null;
    public bool HasRemoveError => RemoveError != null;

    /// <summary>A saved secret's field: the "leave blank to keep" placeholder once connected.</summary>
    public string SecretPlaceholder => IsConnected ? KeepSavedPlaceholder : SecretHint;

    /// <summary>The secret field's placeholder before anything is saved.</summary>
    protected virtual string SecretHint => "";

    /// <summary>The <c>PUT</c>, built from the form; throws <see cref="ApiException"/> with the server's reason.</summary>
    protected abstract Task SendAsync();

    /// <summary>The <c>DELETE</c>.</summary>
    protected abstract Task DeleteAsync();

    /// <summary>Empties the secret fields after a save or remove, so nothing lingers in the form.</summary>
    protected abstract void ClearSecrets();

    [RelayCommand]
    private async Task SaveAsync()
    {
        if (!CanSave)
        {
            return;
        }
        Error = null;
        Notice = null;
        RemoveError = null;
        IsSaving = true;
        try
        {
            await SendAsync();
            ClearSecrets();
            IsConnected = true;
            Notice = SuccessText;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        catch (FormatException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }

    [RelayCommand]
    private async Task RemoveAsync()
    {
        if (!CanRemove)
        {
            return;
        }
        Error = null;
        Notice = null;
        RemoveError = null;
        IsRemoving = true;
        try
        {
            await DeleteAsync();
            ClearSecrets();
            IsConnected = false;
        }
        catch (ApiException failure)
        {
            RemoveError = failure.Message;
        }
        finally
        {
            IsRemoving = false;
        }
    }
}

/// <summary>"Telegram notifications": a bot token from @BotFather and the chat to post to.</summary>
public sealed partial class TelegramChannelViewModel(AppModel model)
    : ChannelCardViewModel(model)
{
    protected override string RemoveText => Loc.Get("Channels_RemoveTelegram");
    protected override string SuccessText => Loc.Get("Channels_TelegramSuccess");

    [ObservableProperty]
    private string botToken = "";

    /// <summary>Prefilled with the saved chat.</summary>
    [ObservableProperty]
    private string chatId = "";

    protected override string SecretHint => "123456789:AA…";

    internal void Apply(TelegramSettings settings)
    {
        IsConnected = settings.Connected;
        ChatId = settings.ChatId ?? "";
    }

    protected override Task SendAsync() =>
        Model.Api.Integrations.Telegram.SaveAsync(new TelegramSettingRequest(BotToken.Trim(), ChatId.Trim()));

    protected override Task DeleteAsync() => Model.Api.Integrations.Telegram.RemoveAsync();

    protected override void ClearSecrets() => BotToken = "";
}

/// <summary>"Pushover notifications": an application token and a user or group key.</summary>
public sealed partial class PushoverChannelViewModel(AppModel model)
    : ChannelCardViewModel(model)
{
    protected override string RemoveText => Loc.Get("Channels_RemovePushover");
    protected override string SuccessText => Loc.Get("Channels_PushoverSuccess");

    [ObservableProperty]
    private string appToken = "";

    [ObservableProperty]
    private string userKey = "";

    internal void Apply(ConnectionState settings) => IsConnected = settings.Connected;

    protected override Task SendAsync() =>
        Model.Api.Integrations.Pushover.SaveAsync(new PushoverSettingRequest(AppToken.Trim(), UserKey.Trim()));

    protected override Task DeleteAsync() => Model.Api.Integrations.Pushover.RemoveAsync();

    protected override void ClearSecrets()
    {
        AppToken = "";
        UserKey = "";
    }
}

/// <summary>"Email notifications": the admin's SMTP server and who to send to. Everything but the password is prefilled.</summary>
public sealed partial class EmailChannelViewModel(AppModel model)
    : ChannelCardViewModel(model)
{
    public static string PortMissingMessage => Loc.Get("Channels_PortMissing");

    protected override string RemoveText => Loc.Get("Channels_RemoveEmail");
    protected override string SuccessText => Loc.Get("Channels_EmailSuccess");

    [ObservableProperty]
    private string host = "";

    [ObservableProperty]
    private string port = "587";

    [ObservableProperty]
    private string username = "";

    [ObservableProperty]
    private string password = "";

    [ObservableProperty]
    private string from = "";

    /// <summary>One or more addresses, separated by commas.</summary>
    [ObservableProperty]
    private string to = "";

    /// <summary>"Secure connection from the start (TLS, usually port 465)".</summary>
    [ObservableProperty]
    private bool secure;

    internal void Apply(EmailSettings settings)
    {
        IsConnected = settings.Connected;
        Host = settings.Host ?? "";
        Port = (settings.Port ?? 587).ToString(CultureInfo.InvariantCulture);
        Username = settings.Username ?? "";
        From = settings.From ?? "";
        To = string.Join(", ", settings.To);
        Secure = settings.Secure;
    }

    protected override Task SendAsync()
    {
        if (!int.TryParse(Port.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var number))
        {
            throw new FormatException(PortMissingMessage);
        }
        var recipients = To
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return Model.Api.Integrations.Email.SaveAsync(new EmailSettingRequest(
            Host.Trim(), number, Secure, Username.Trim(), Password, From.Trim(), recipients));
    }

    protected override Task DeleteAsync() => Model.Api.Integrations.Email.RemoveAsync();

    protected override void ClearSecrets() => Password = "";
}
