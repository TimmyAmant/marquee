using System.ComponentModel;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
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
        SizeChanged += (_, _) => LayoutHero();
        ViewModel.PropertyChanged += OnViewModelPropertyChanged;
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ViewModel.HasHero))
        {
            LayoutHero();
        }
    }

    /// <summary>
    /// The band grows with the window (components/entity-hero.tsx) and the
    /// header moves down onto it; "From …" sits at its bottom right where
    /// the header leaves room, above the header's right end otherwise.
    /// Without a hero, the plain header in the usual gutters.
    /// </summary>
    private void LayoutHero()
    {
        var width = ActualWidth;
        var height = ActualHeight;
        if (!ViewModel.HasHero || width <= 0 || height <= 0)
        {
            HeaderGrid.Margin = new Thickness(28, 20, 28, 0);
            return;
        }
        var band = EntityHeroItem.BandHeight(width, height);
        var top = EntityHeroItem.HeaderTop(band);
        BackdropHost.Height = band;
        HeaderGrid.Margin = new Thickness(28, top, 28, 0);
        KnownForButton.Margin = width >= 1200
            ? new Thickness(0, band - 64, 40, 0)
            : new Thickness(0, Math.Max(12, top - 44), 28, 0);
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
