using System.Windows.Input;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// components/entity-hero.tsx: the title a person or studio is best known
/// for, whose backdrop runs full-bleed behind their page's header (the title
/// page's band and fades), with a small "From {title}" button to it. Null
/// (<see cref="For"/>) when there's no title with artwork: the page keeps its
/// plain header.
/// </summary>
public sealed class EntityHeroItem
{
    private readonly Uri backdropUrl;
    private ImageSource? backdrop;

    private EntityHeroItem(AppModel model, KnownForTitle title, Uri backdropUrl)
    {
        this.backdropUrl = backdropUrl;
        FromLine = Loc.Format("Person_KnownForFrom", title.Name);
        FromLabel = Loc.Format("Person_KnownForFromLabel", title.Name);
        Open = new RelayCommand(() => model.OpenTitle(title.Id));
    }

    /// <summary>Decoded at no more than 2560 wide, like the title page's.</summary>
    public ImageSource Backdrop => backdrop ??= new BitmapImage(backdropUrl) { DecodePixelWidth = 2560 };

    /// <summary>"From How I Met Your Mother".</summary>
    public string FromLine { get; }

    /// <summary>What a screen reader calls the button.</summary>
    public string FromLabel { get; }

    public ICommand Open { get; }

    public static EntityHeroItem? For(AppModel model, KnownForTitle? title) =>
        title?.BackdropPath.Url(ImageSize.Original) is { } url ? new EntityHeroItem(model, title, url) : null;

    /// <summary>The band's height: a little over half the window (a person's header is shorter than a title's), never under 300.</summary>
    public static double BandHeight(double width, double height) => Math.Max(300, Math.Min(height * 0.58, width * 0.42));

    /// <summary>The header starts a little over a third of the way down the band.</summary>
    public static double HeaderTop(double band) => Math.Round(band * 0.36);
}

/// <summary>The official link pills under a person's bio or a studio's description, as the title page's.</summary>
public static class EntityLinkItems
{
    public static IReadOnlyList<LinkItem> From(IEnumerable<ExternalLink> links) =>
        links.Select(link => LinkItem.Https(link.Label, link.Link)).OfType<LinkItem>().ToList();
}
