using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>A person, navigated to with a <see cref="Route.Person"/> (what <c>AppModel.OpenPerson</c> sends) or a bare TMDb id.</summary>
public sealed partial class PersonPage : Page
{
    public PersonViewModel ViewModel { get; }

    public PersonPage()
    {
        ViewModel = new PersonViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var tmdbId = e.Parameter switch
        {
            Route.Person route => route.TmdbId,
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
