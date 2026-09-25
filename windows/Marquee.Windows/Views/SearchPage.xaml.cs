using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// Search results for a <see cref="Route.Search"/> (the query is the
/// navigation parameter, as the record or a plain string), or the Search
/// section's landing page when navigated to without one.
/// </summary>
public sealed partial class SearchPage : Page
{
    public SearchViewModel ViewModel { get; }

    public SearchPage()
    {
        ViewModel = new SearchViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var query = e.Parameter switch
        {
            Route.Search route => route.Query,
            string text => text,
            _ => null,
        };
        ViewModel.Activate(query);
        if (!ViewModel.HasQuery)
        {
            PageSearchBox.Focus(FocusState.Programmatic);
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }

    private void OnQuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        ViewModel.SearchCommand.Execute(args.QueryText);
        sender.Text = "";
    }
}
