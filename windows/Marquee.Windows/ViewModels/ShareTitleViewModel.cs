using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One person in "Send to someone in the household": their photo (else
/// initials), their name and a checkbox. Every tick is reported to the
/// dialog, which enables Send.
/// </summary>
public sealed partial class ShareMemberRow : ObservableObject
{
    private readonly Action changed;

    /// <summary>The checkbox; <c>bool?</c> to match <c>CheckBox.IsChecked</c>.</summary>
    [ObservableProperty]
    private bool? isSelected = false;

    public ShareMemberRow(ShareableUser user, Action changed)
    {
        this.changed = changed;
        UserId = user.UserId;
        Label = user.Label;
        AvatarUrl = user.AvatarUrl ?? "";
    }

    // Internal: bindings use the flattened properties (see HouseholdMemberRow.Member).
    internal Guid UserId { get; }

    /// <summary>The display name, else the username.</summary>
    public string Label { get; }

    /// <summary>The photo's server path, empty for none (the avatar shows initials).</summary>
    public string AvatarUrl { get; }

    internal bool IsPicked => IsSelected == true;

    partial void OnIsSelectedChanged(bool? value) => changed();
}

/// <summary>
/// components/share-button.tsx's dialog on a title: "Send to someone in the
/// household" (<c>GET /users/shareable</c>, then <c>POST …/share</c>) and
/// "Share a link" (Marquee, TMDb or IMDb) through Windows' Share panel or
/// the clipboard. The rules are <see cref="TitleShareForm"/>'s; this keeps
/// the state the dialog binds to.
/// </summary>
public sealed partial class ShareTitleViewModel : ObservableObject
{
    public const string SendLabelIdle = "Send";
    public const string SendLabelBusy = "Sending…";
    public const string CopyLabelIdle = "Copy link";
    public const string CopyLabelDone = "Copied";

    private readonly AppModel model;
    private readonly TitleId title;
    private readonly string name;
    private readonly string? imdbId;
    private bool loaded;

    /// <summary>The choices, rebuilt once the public address is known; the Marquee one first when there is one.</summary>
    private IReadOnlyList<ShareLinkOption> linkOptions;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMembers))]
    [NotifyPropertyChangedFor(nameof(CanSend))]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    private IReadOnlyList<ShareMemberRow> members = [];

    [ObservableProperty]
    private bool isLoadingMembers;

    /// <summary>"No one else has an account here yet.", or why the list couldn't load; empty otherwise.</summary>
    [ObservableProperty]
    private string membersMessage = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NoteCounter))]
    [NotifyPropertyChangedFor(nameof(IsNoteTooLong))]
    private string note = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SendLabel))]
    [NotifyPropertyChangedFor(nameof(CanSend))]
    [NotifyPropertyChangedFor(nameof(IsIdle))]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    private bool isSending;

    /// <summary>The server's (or the form's) refusal; empty for none.</summary>
    [ObservableProperty]
    private string sendError = "";

    /// <summary>"Sent to Kid." / "Sent to 3 people."; empty until something is sent.</summary>
    [ObservableProperty]
    private string sentMessage = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(LinkText))]
    private int selectedLinkIndex;

    [ObservableProperty]
    private string copyLabel = CopyLabelIdle;

    /// <summary>The Share panel couldn't open; empty otherwise.</summary>
    [ObservableProperty]
    private string linkError = "";

    public ShareTitleViewModel(AppModel model, TitleId title, string name, string? imdbId)
    {
        this.model = model;
        this.title = title;
        this.name = name;
        this.imdbId = imdbId;
        linkOptions = TitleShareForm.LinkOptions(title, name, imdbId, null, model.Session.Server?.BaseUrl);
        CanUseShareSheet = ShareSheet.IsSupported;
    }

    /// <summary>"Share “Ice Age”".</summary>
    public string Heading => $"Share “{name}”";

    public bool HasMembers => Members.Count > 0;
    public bool IsIdle => !IsSending;

    /// <summary>At least one person ticked, and nothing on its way.</summary>
    public bool CanSend => !IsSending && Members.Any(row => row.IsPicked);

    public string SendLabel => IsSending ? SendLabelBusy : SendLabelIdle;

    /// <summary>"250/280" once the note is close to the limit; empty before that.</summary>
    public string NoteCounter => TitleShareForm.NoteCounter(Note) ?? "";

    public bool IsNoteTooLong => TitleShareForm.NoteLength(Note) > TitleShareForm.MaxNoteLength;

    /// <summary>"Marquee — they'll need to sign in", "TMDb — anyone can open it", "IMDb — anyone can open it".</summary>
    public IReadOnlyList<string> LinkLabels => linkOptions.Select(option => option.Label).ToList();

    /// <summary>The picked link, shown under the choices.</summary>
    public string LinkText => SelectedLink?.Url.AbsoluteUri ?? "";

    /// <summary>"Share…" shows only where Windows has the Share panel.</summary>
    public bool CanUseShareSheet { get; }

    private ShareLinkOption? SelectedLink =>
        SelectedLinkIndex >= 0 && SelectedLinkIndex < linkOptions.Count ? linkOptions[SelectedLinkIndex] : null;

    // MARK: Loading

    /// <summary>
    /// The dialog opened: who it can go to, and the public address the
    /// Marquee link should use. Once only; the links work meanwhile, on the
    /// address this app is connected to.
    /// </summary>
    public async Task LoadAsync()
    {
        if (loaded)
        {
            return;
        }
        loaded = true;
        IsLoadingMembers = true;
        MembersMessage = "";
        try
        {
            var response = await model.Api.Sharing.ListShareableUsersAsync();
            Members = response.Results.Select(user => new ShareMemberRow(user, OnSelectionChanged)).ToList();
            MembersMessage = Members.Count == 0 ? TitleShareForm.NoOneElseMessage : "";
            if (response.PublicUrl.NonBlank() != null)
            {
                // Usually only the Marquee link's address changes; the
                // choices (and the pick) are replaced only if they differ.
                var previous = linkOptions;
                linkOptions = TitleShareForm.LinkOptions(title, name, imdbId, response.PublicUrl, model.Session.Server?.BaseUrl);
                if (!previous.Select(option => option.Kind).SequenceEqual(linkOptions.Select(option => option.Kind)))
                {
                    OnPropertyChanged(nameof(LinkLabels));
                    SelectedLinkIndex = 0;
                }
                OnPropertyChanged(nameof(LinkText));
            }
        }
        catch (ApiException error)
        {
            if (error.IsCancellation)
            {
                return;
            }
            MembersMessage = error.Kind == ApiErrorKind.NotFound ? TitleShareForm.OlderServerMessage : error.Message;
        }
        finally
        {
            IsLoadingMembers = false;
        }
    }

    private void OnSelectionChanged()
    {
        OnPropertyChanged(nameof(CanSend));
        SendCommand.NotifyCanExecuteChanged();
        SendError = "";
    }

    partial void OnNoteChanged(string value) => SendError = "";

    // MARK: Sending

    /// <summary>
    /// "Send": the form's checks, then <c>POST …/share</c>. Afterwards "Sent
    /// to Kid." and the ticks and note are cleared, so the next send starts
    /// fresh; a refusal shows the server's message.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSend))]
    private async Task SendAsync()
    {
        if (IsSending)
        {
            return;
        }
        var picked = Members.Where(row => row.IsPicked).ToList();
        var (body, error) = TitleShareForm.Build(picked.Select(row => row.UserId), Note);
        if (body == null)
        {
            SendError = error ?? TitleShareForm.PickSomeoneMessage;
            return;
        }
        IsSending = true;
        SendError = "";
        SentMessage = "";
        try
        {
            var sharedWith = await model.Api.Sharing.ShareTitleAsync(title.MediaType, title.TmdbId, body);
            SentMessage = TitleShareForm.SentMessage(picked.Select(row => row.Label).ToList(), sharedWith);
            foreach (var row in picked)
            {
                row.IsSelected = false;
            }
            Note = "";
        }
        catch (ApiException failure)
        {
            SendError = failure.Kind == ApiErrorKind.NotFound ? TitleShareForm.RecipientGoneMessage : failure.Message;
        }
        finally
        {
            IsSending = false;
        }
    }

    // MARK: Links

    partial void OnSelectedLinkIndexChanged(int value)
    {
        CopyLabel = CopyLabelIdle;
        LinkError = "";
    }

    /// <summary>"Share…": Windows' Share panel with the picked link.</summary>
    [RelayCommand]
    private void ShareLink()
    {
        if (SelectedLink is not { } link)
        {
            return;
        }
        LinkError = ShareSheet.Show(name, link.Text, link.Url) ? "" : "Couldn't open the Share panel. Copy the link instead.";
    }

    /// <summary>"Copy link", then "Copied" until another link is picked.</summary>
    [RelayCommand]
    private void CopyLink()
    {
        if (SelectedLink is not { } link)
        {
            return;
        }
        if (ClipboardText.Copy(link.Url.AbsoluteUri))
        {
            CopyLabel = CopyLabelDone;
            LinkError = "";
        }
        else
        {
            LinkError = "Another app is using the clipboard. Try again.";
        }
    }
}
