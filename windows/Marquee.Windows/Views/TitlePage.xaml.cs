using Marquee.Core.Api;
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
        var dialog = new SeasonRequestDialog(ViewModel.Name, ViewModel.PickerSeasons, ViewModel.RequestSeasonsAsync) { XamlRoot = XamlRoot };
        await dialog.TryShowAsync();
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
                Title = "Couldn't fix the match",
                Content = error.Message,
                CloseButtonText = "OK",
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
            Content = "Each title is added with your Sonarr or Radarr, one at a time.",
            PrimaryButtonText = "Add all",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
        };
        if (await confirm.TryShowAsync() == ContentDialogResult.Primary)
        {
            await ViewModel.AddAllMissingCommand.ExecuteAsync(null);
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
