using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// A movie or series. Navigated to with a <see cref="Route.Title"/> (what
/// <c>AppModel.OpenTitle</c> sends) or a bare <see cref="TitleId"/>; either
/// way <see cref="Id"/> says which title. The dialogs (season picker, Fix ID,
/// Add all) live here because a ContentDialog needs the page's XamlRoot.
/// </summary>
public sealed partial class TitlePage : Page
{
    public TitleViewModel ViewModel { get; }

    public TitlePage()
    {
        ViewModel = new TitleViewModel(AppServices.Model);
        InitializeComponent();
        SizeChanged += OnPageSizeChanged;
        ViewModel.PropertyChanged += OnViewModelPropertyChanged;
    }

    /// <summary>
    /// The backdrop grows with the window like the website's hero
    /// (components/title-hero.tsx): min(70% of the height, 16:9 of the width),
    /// never under 300; the poster row keeps starting a little under halfway
    /// down it.
    /// </summary>
    private void OnPageSizeChanged(object sender, SizeChangedEventArgs e)
    {
        var width = e.NewSize.Width;
        var height = e.NewSize.Height;
        if (width <= 0 || height <= 0)
        {
            return;
        }
        var backdrop = Math.Max(300, Math.Min(height * 0.7, width * 0.5625));
        BackdropHost.Height = backdrop;
        HeroColumns.Margin = new Thickness(28, -Math.Round(backdrop * 0.47), 28, 0);
        // The loading page lines up with the page that replaces it.
        SkeletonBackdrop.Height = backdrop;
        SkeletonColumns.Margin = HeroColumns.Margin;
    }

    /// <summary>The artwork has decoded: fade it in over the backdrop's surface.</summary>
    private void OnBackdropOpened(object sender, RoutedEventArgs e)
    {
        BackdropImage.Opacity = 1;
    }

    /// <summary>The artwork the image was last given; a reload hands back the same one.</summary>
    private object? shownBackdrop;

    /// <summary>
    /// Another title's artwork starts hidden again, until it has decoded too.
    /// The same image again (a reload) stays as it is: it won't open twice.
    /// </summary>
    private void OnViewModelPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(TitleViewModel.Backdrop) && !string.IsNullOrEmpty(e.PropertyName))
        {
            return;
        }
        var current = ViewModel.Backdrop;
        if (!ReferenceEquals(current, shownBackdrop))
        {
            shownBackdrop = current;
            BackdropImage.Opacity = 0;
        }
    }

    /// <summary>The chevron on Add: opens or closes "Advanced" (the first opening loads the options).</summary>
    private void OnAdvancedToggleClick(object sender, RoutedEventArgs e)
    {
        ViewModel.AddAdvanced.IsExpanded = !ViewModel.AddAdvanced.IsExpanded;
    }

    /// <summary>The chevron on "Add to 4K …": that add's own Advanced panel.</summary>
    private void OnAdvancedFourKToggleClick(object sender, RoutedEventArgs e)
    {
        ViewModel.AddFourKAdvanced.IsExpanded = !ViewModel.AddFourKAdvanced.IsExpanded;
    }

    /// <summary>The title this page shows; null only when navigated to without a parameter.</summary>
    public TitleId? Id { get; private set; }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        Id = e.Parameter switch
        {
            Route.Title route => route.Id,
            TitleId id => id,
            _ => (TitleId?)null,
        };
        if (Id is { } title)
        {
            ViewModel.Activate(title);
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }

    /// <summary>
    /// "Request" and "Request more seasons": the season picker on a TV show
    /// the server offers seasons for, else today's whole-series request. The
    /// picker sends the request itself and keeps a failure inline; the page
    /// reloads once it succeeds.
    /// </summary>
    private async void OnRequestClick(object sender, RoutedEventArgs e)
    {
        if (!ViewModel.OpensSeasonPicker)
        {
            await ViewModel.RequestCommand.ExecuteAsync(null);
            return;
        }
        var dialog = new SeasonRequestDialog(ViewModel.Name, ViewModel.PickerSeasons, ViewModel.RequestSeasonsAsync, ViewModel.AutoApprove) { XamlRoot = XamlRoot };
        await dialog.TryShowAsync();
    }

    /// <summary>
    /// "Report a problem" / "Report another": the dialog sends the report
    /// itself and keeps a refusal inline; the pill shows once it's sent.
    /// </summary>
    private async void OnReportProblemClick(object sender, RoutedEventArgs e)
    {
        if (Id is not { } title)
        {
            return;
        }
        var dialog = new ReportProblemDialog(title.MediaType == MediaType.Tv, ViewModel.ReportSeasonNumbers, ViewModel.ReportProblemAsync)
        {
            XamlRoot = XamlRoot,
        };
        await dialog.TryShowAsync();
    }

    /// <summary>
    /// "Share": the dialog sends to household members itself and stays open
    /// ("Sent to Kid."), and hands links to the Share panel or the clipboard.
    /// </summary>
    private async void OnShareClick(object sender, RoutedEventArgs e)
    {
        if (ViewModel.CreateShare() is not { } share)
        {
            return;
        }
        var dialog = new ShareTitleDialog(share) { XamlRoot = XamlRoot };
        await dialog.TryShowAsync();
    }

    /// <summary>
    /// "Block requests" (components/block-requests-button.tsx): an optional
    /// reason for whoever asks, then Block. A refusal stays in the dialog;
    /// once blocked, the status block is re-read and Unblock shows.
    /// </summary>
    private async void OnBlockRequestsClick(object sender, RoutedEventArgs e)
    {
        var dialog = new BlockRequestsDialog(ViewModel.BlockAsync) { XamlRoot = XamlRoot };
        await dialog.TryShowAsync();
    }

    /// <summary>
    /// "Remove from Radarr/Sonarr" (components/remove-from-arr-button.tsx,
    /// 0.58+): asks first, with "Also delete the files" off and (0.68+) an
    /// optional reason for whoever requested it, then takes the title off
    /// every server that has it.
    /// </summary>
    private void OnRemoveFromArrClick(object sender, RoutedEventArgs e) => ConfirmRemoveFromArr(fourK: false);

    /// <summary>"Remove from Radarr 4K": the same, for the 4K servers.</summary>
    private void OnRemoveFromArrFourKClick(object sender, RoutedEventArgs e) => ConfirmRemoveFromArr(fourK: true);

    private async void ConfirmRemoveFromArr(bool fourK)
    {
        if (Id is not { } title)
        {
            return;
        }
        var arr = fourK ? ViewModel.FourKArrName : title.MediaType.ArrName;
        var deleteFiles = new CheckBox { Content = Loc.Get("Title_RemoveDeleteFiles") };
        var body = new StackPanel { Spacing = 12 };
        body.Children.Add(new TextBlock { Text = Loc.Format("Title_RemoveFromArrBody", arr), TextWrapping = TextWrapping.Wrap });
        body.Children.Add(deleteFiles);
        body.Children.Add(new TextBlock
        {
            Text = Loc.Get("Title_RemoveDeleteFilesHelp"),
            TextWrapping = TextWrapping.Wrap,
            Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"],
        });
        // The decline chooser's presets, with "No reason" first.
        var reasons = new ReasonChooser(ReasonChooser.DefaultReasons, optional: true);
        body.Children.Add(new TextBlock { Text = Loc.Get("Title_RemoveReasonIntro"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0) });
        body.Children.Add(reasons);
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Format("Title_RemoveFromArrTitle", ViewModel.Name, arr),
            Content = body,
            PrimaryButtonText = Loc.Get("Title_RemoveConfirm"),
            CloseButtonText = Loc.Get("Title_Cancel"),
            DefaultButton = ContentDialogButton.Close,
        };
        deleteFiles.Checked += (_, _) => dialog.PrimaryButtonText = Loc.Get("Title_RemoveAndDelete");
        deleteFiles.Unchecked += (_, _) => dialog.PrimaryButtonText = Loc.Get("Title_RemoveConfirm");
        // "Other" waits for its words.
        reasons.Changed += (_, _) => dialog.IsPrimaryButtonEnabled = reasons.IsValid;
        if (await dialog.TryShowAsync() != ContentDialogResult.Primary)
        {
            return;
        }
        await ViewModel.RemoveFromArrAsync(deleteFiles.IsChecked == true, fourK, reasons.Reason);
    }

    /// <summary>"Wrong match? Fix ID": ask for an id, repoint, then open the corrected title.</summary>
    private async void OnFixIdClick(object sender, RoutedEventArgs e)
    {
        if (Id is not { } title)
        {
            return;
        }
        var dialog = new RelinkDialog(title.MediaType) { XamlRoot = XamlRoot };
        if (await dialog.TryShowAsync() != ContentDialogResult.Primary || dialog.Target is not { } target)
        {
            return;
        }
        try
        {
            var newTmdbId = await ViewModel.RelinkAsync(target);
            AppServices.Model.OpenTitle(title.MediaType, newTmdbId);
        }
        catch (ApiException error)
        {
            var failed = new ContentDialog
            {
                XamlRoot = XamlRoot,
                Title = Loc.Get("Title_FixIdFailed"),
                Content = error.Message,
                CloseButtonText = Loc.Get("Title_Ok"),
            };
            await failed.TryShowAsync();
        }
    }

    /// <summary>The franchise row's "Add all N missing", behind a confirmation like the website.</summary>
    private async void OnAddAllClick(object sender, RoutedEventArgs e)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = ViewModel.AddAllConfirmation,
            Content = Loc.Get("Title_AddAllBody"),
            PrimaryButtonText = Loc.Get("Title_AddAllConfirm"),
            CloseButtonText = Loc.Get("Title_Cancel"),
            DefaultButton = ContentDialogButton.Primary,
        };
        if (await confirm.TryShowAsync() == ContentDialogResult.Primary)
        {
            await ViewModel.AddAllMissingCommand.ExecuteAsync(null);
        }
    }

    /// <summary>A member's "Request all N missing", behind the website's confirmation.</summary>
    private async void OnRequestAllClick(object sender, RoutedEventArgs e)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = ViewModel.RequestAllConfirmation,
            Content = Loc.Get("Title_RequestAllBody"),
            PrimaryButtonText = Loc.Get("Title_RequestAllConfirm"),
            CloseButtonText = Loc.Get("Title_Cancel"),
            DefaultButton = ContentDialogButton.Primary,
        };
        if (await confirm.TryShowAsync() == ContentDialogResult.Primary)
        {
            await ViewModel.RequestAllMissingCommand.ExecuteAsync(null);
        }
    }

    /// <summary>The "Location" row's Copy button.</summary>
    private void OnCopyPathClick(object sender, RoutedEventArgs e)
    {
        var path = ViewModel.FilePath;
        if (path.Length == 0)
        {
            return;
        }
        var package = new global::Windows.ApplicationModel.DataTransfer.DataPackage();
        package.SetText(path);
        try
        {
            global::Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            // Another app (a clipboard manager, Remote Desktop) is holding the
            // clipboard; nothing is copied, rather than the app closing.
        }
    }
}
