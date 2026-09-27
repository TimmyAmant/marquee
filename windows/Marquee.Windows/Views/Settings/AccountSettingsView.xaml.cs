using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Account. The view owns the household member dialogs (Add
/// member, Edit, the Remove confirmation, Link Jellyfin, Import), because a
/// ContentDialog needs its XamlRoot, and lends them to the view model.
/// </summary>
public sealed partial class AccountSettingsView : UserControl, ISettingsTabView
{
    public AccountSettingsViewModel ViewModel { get; }

    public AccountSettingsView()
    {
        ViewModel = new AccountSettingsViewModel(AppServices.Model);
        ViewModel.AddMemberPrompt = ShowAddMemberDialogAsync;
        ViewModel.EditMemberPrompt = ShowEditMemberDialogAsync;
        ViewModel.ProfilePrompt = ShowProfileDialogAsync;
        ViewModel.RemoveMemberPrompt = ConfirmRemoveMemberAsync;
        ViewModel.LinkJellyfinPrompt = ShowLinkJellyfinDialogAsync;
        ViewModel.ImportMembersPrompt = ShowImportMembersDialogAsync;
        ViewModel.Personal.RemoveChannelPrompt = ConfirmRemoveChannelAsync;
        ViewModel.Trakt.RemovePrompt = ConfirmRemoveTraktSyncAsync;
        InitializeComponent();
    }

    /// <summary>"Stop syncing {name}?" for a Trakt list, defaulting to Cancel.</summary>
    private async Task<bool> ConfirmRemoveTraktSyncAsync(TraktSyncRow row)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Format("Account_TraktRemoveTitle", row.Name),
            Content = Loc.Get("Account_TraktRemoveBody"),
            PrimaryButtonText = Loc.Get("Account_Remove"),
            CloseButtonText = Loc.Get("Account_Cancel"),
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();

    /// <summary>"Add a household member": the new account, or null when the admin cancelled.</summary>
    private async Task<HouseholdMember?> ShowAddMemberDialogAsync()
    {
        var dialog = new AddMemberDialog(ViewModel.CreateMemberAsync) { XamlRoot = XamlRoot };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Created : null;
    }

    /// <summary>The edit dialog for one account: what the server saved, or null when cancelled.</summary>
    private async Task<UpdateUserResult?> ShowEditMemberDialogAsync(HouseholdMember member)
    {
        var dialog = new EditMemberDialog(
            member,
            ViewModel.IsAdmin,
            ViewModel.UpdateMemberAsync,
            ViewModel.SetMemberPhotoAsync,
            ViewModel.RemoveMemberPhotoAsync)
        {
            XamlRoot = XamlRoot,
        };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Saved : null;
    }

    /// <summary>
    /// app/profile/[id] (0.53+): the member's photo and name, when they
    /// joined, their request counts and limits, and their Plex Watchlist.
    /// Built here rather than in XAML: it's read-only and shown briefly.
    /// </summary>
    private async Task ShowProfileDialogAsync(HouseholdMember member)
    {
        var body = new StackPanel { Spacing = 14, MinWidth = 440 };
        var header = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 14 };
        header.Children.Add(new AvatarView { Label = member.Label, AvatarUrl = member.AvatarUrl ?? "", Diameter = 64 });
        var names = new StackPanel { VerticalAlignment = Microsoft.UI.Xaml.VerticalAlignment.Center, Spacing = 2 };
        names.Children.Add(new TextBlock { Text = member.Label, Style = (Microsoft.UI.Xaml.Style)Microsoft.UI.Xaml.Application.Current.Resources["SubtitleTextBlockStyle"] });
        names.Children.Add(new TextBlock { Text = member.Username, Opacity = 0.7 });
        names.Children.Add(new TextBlock
        {
            Text = Loc.Format("Profile_Joined", member.CreatedAt.ToLocalTime().ToString("D", System.Globalization.CultureInfo.CurrentCulture)),
            Opacity = 0.6,
            FontSize = 12,
        });
        header.Children.Add(names);
        body.Children.Add(header);
        var stats = new TextBlock { Text = Loc.Get("Profile_Loading"), TextWrapping = Microsoft.UI.Xaml.TextWrapping.Wrap };
        body.Children.Add(stats);

        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Get("Profile_Title"),
            Content = new ScrollViewer { Content = body, MaxHeight = 520 },
            CloseButtonText = Loc.Get("Profile_Done"),
            DefaultButton = ContentDialogButton.Close,
        };
        _ = FillAsync();
        await dialog.TryShowAsync();

        async Task FillAsync()
        {
            try
            {
                var profile = await ViewModel.LoadProfileAsync(member.Id);
                body.Children.Remove(stats);
                var grid = new Grid { ColumnSpacing = 10 };
                for (var i = 0; i < 3; i++)
                {
                    grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new Microsoft.UI.Xaml.GridLength(1, Microsoft.UI.Xaml.GridUnitType.Star) });
                }
                AddStat(grid, 0, Loc.Get("Profile_TotalRequests"), profile.Requests.Total.ToString(System.Globalization.CultureInfo.CurrentCulture), MemberProfileText.RequestSplit(profile.Requests));
                AddStat(grid, 1, Loc.Get("Profile_MovieRequestsLeft"), MemberProfileText.LimitValue(profile.RequestLimits.Movie), MemberProfileText.LimitDetail(profile.RequestLimits.Movie));
                AddStat(grid, 2, Loc.Get("Profile_SeriesRequestsLeft"), MemberProfileText.LimitValue(profile.RequestLimits.Tv), MemberProfileText.LimitDetail(profile.RequestLimits.Tv));
                body.Children.Add(grid);
                if (profile.Watchlist is { } watchlist)
                {
                    body.Children.Add(new TextBlock
                    {
                        Text = Loc.Get("Profile_PlexWatchlist"),
                        Style = (Microsoft.UI.Xaml.Style)Microsoft.UI.Xaml.Application.Current.Resources["BodyStrongTextBlockStyle"],
                    });
                    body.Children.Add(new TextBlock
                    {
                        Text = watchlist.Count == 0
                            ? Loc.Get("Profile_WatchlistEmpty")
                            : string.Join("\n", watchlist.Select(card => card.Year is { } year ? $"{card.Name} ({year})" : card.Name)),
                        TextWrapping = Microsoft.UI.Xaml.TextWrapping.Wrap,
                        Opacity = 0.85,
                    });
                }
            }
            catch (Marquee.Core.Api.ApiException error)
            {
                stats.Text = error.Message;
            }
        }
    }

    /// <summary>One stat card of the profile: its name, the number, a line under it.</summary>
    private static void AddStat(Grid grid, int column, string label, string value, string detail)
    {
        var card = new Border
        {
            Padding = new Microsoft.UI.Xaml.Thickness(12),
            CornerRadius = new Microsoft.UI.Xaml.CornerRadius(8),
            BorderThickness = new Microsoft.UI.Xaml.Thickness(1),
            BorderBrush = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["CardStrokeColorDefaultBrush"],
            Background = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["CardBackgroundFillColorDefaultBrush"],
        };
        var stack = new StackPanel { Spacing = 2 };
        stack.Children.Add(new TextBlock { Text = label, FontSize = 12, Opacity = 0.7, TextWrapping = Microsoft.UI.Xaml.TextWrapping.Wrap });
        stack.Children.Add(new TextBlock { Text = value, FontSize = 22, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        if (detail.Length > 0)
        {
            stack.Children.Add(new TextBlock { Text = detail, FontSize = 12, Opacity = 0.7 });
        }
        card.Child = stack;
        Grid.SetColumn(card, column);
        grid.Children.Add(card);
    }

    /// <summary>"Link Jellyfin": true once the dialog linked the account.</summary>
    private async Task<bool> ShowLinkJellyfinDialogAsync()
    {
        var dialog = new JellyfinLinkDialog(ViewModel.JellyfinName, ViewModel.LinkJellyfinAccountAsync) { XamlRoot = XamlRoot };
        return await dialog.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Import from Plex/Jellyfin": what was imported, or null when cancelled.</summary>
    private async Task<ImportUsersResult?> ShowImportMembersDialogAsync(MediaServerKind server)
    {
        var dialog = new ImportMembersDialog(server, ViewModel.ServerName(server), ViewModel.LoadImportCandidatesAsync, ViewModel.RunImportAsync) { XamlRoot = XamlRoot };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Result : null;
    }

    /// <summary>"Remove {name}?" for one of your own notification channels, defaulting to Cancel.</summary>
    private async Task<bool> ConfirmRemoveChannelAsync(string name)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Format("Account_ChannelRemoveTitle", name),
            Content = Loc.Get("Account_ChannelRemoveBody"),
            PrimaryButtonText = Loc.Get("Account_Remove"),
            CloseButtonText = Loc.Get("Account_Cancel"),
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Remove {username}?", defaulting to Cancel since it can't be undone.</summary>
    private async Task<bool> ConfirmRemoveMemberAsync(HouseholdMember member)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Format("Account_MemberRemoveTitle", member.Username),
            Content = AccountSettingsViewModel.RemoveMemberConsequence,
            PrimaryButtonText = Loc.Get("Account_Remove"),
            CloseButtonText = Loc.Get("Account_Cancel"),
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }
}
