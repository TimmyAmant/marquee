using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>A studio, navigated to with a <see cref="Route.Company"/> (what <c>AppModel.OpenCompany</c> sends) or a bare TMDb id.</summary>
public sealed partial class CompanyPage : Page
{
    public CompanyViewModel ViewModel { get; }

    public CompanyPage()
    {
        ViewModel = new CompanyViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var tmdbId = e.Parameter switch
        {
            Route.Company route => route.TmdbId,
            int id => id,
            _ => 0,
        };
        if (tmdbId > 0)
        {
            ViewModel.Activate(tmdbId);
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }
}
