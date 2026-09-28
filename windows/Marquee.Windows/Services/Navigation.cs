using Marquee.Core.Localization;
using Marquee.Core.Models;

namespace Marquee.Windows.Services;

/// <summary>The shell's sections (the rail and the menu), the counterpart of the Mac app's <c>SidebarItem</c> plus Search and Settings.</summary>
public enum Section
{
    Discover,
    Movies,
    Series,

    /// <summary>The household library in one place (0.51+ servers).</summary>
    Library,

    Search,
    Requests,
    Favorites,
    Calendar,
    Settings,
}

public static class SectionExtensions
{
    /// <summary>The menu row's <c>Tag</c> in MainWindow.xaml.</summary>
    public static string Tag(this Section section) => section.ToString().ToLowerInvariant();

    /// <summary>The label in the menu and the page heading.</summary>
    public static string Title(this Section section) => section switch
    {
        Section.Discover => Loc.Get("Nav_Discover"),
        Section.Movies => Loc.Get("Nav_Movies"),
        Section.Series => Loc.Get("Nav_Series"),
        Section.Library => Loc.Get("Nav_Library"),
        Section.Search => Loc.Get("Nav_Search"),
        Section.Requests => Loc.Get("Nav_Requests"),
        Section.Favorites => Loc.Get("Nav_Favorites"),
        Section.Calendar => Loc.Get("Nav_Calendar"),
        Section.Settings => Loc.Get("Nav_Settings"),
        _ => section.ToString(),
    };

    public static Section? FromTag(string? tag)
    {
        foreach (var section in Enum.GetValues<Section>())
        {
            if (section.Tag() == tag)
            {
                return section;
            }
        }
        return null;
    }
}

/// <summary>
/// A page pushed on top of a section (the Mac app's <c>Route</c>). The
/// window maps each case to a page type; a route without a page yet lands
/// on the placeholder, so navigation never throws while the app is being
/// built out.
/// </summary>
public abstract record Route
{
    private Route()
    {
    }

    /// <summary>A movie or series: <c>TitlePage</c> receives this record as its navigation parameter.</summary>
    public sealed record Title(TitleId Id) : Route;

    public sealed record Person(int TmdbId) : Route;

    public sealed record Company(int TmdbId) : Route;

    public sealed record Search(string Query) : Route;

    /// <summary>
    /// A Discover shelf's "See all": <c>DiscoverListPage</c> receives this
    /// record. <paramref name="Heading"/> is the row's name (a custom row's
    /// id has none of its own), shown until the list's title arrives.
    /// </summary>
    public sealed record DiscoverList(DiscoverListKind List, string? Heading = null) : Route;

    /// <summary>What every error message means (<c>GET /help/errors</c>): <c>ErrorReferencePage</c>.</summary>
    public sealed record ErrorReference : Route;

    /// <summary>
    /// The same page on the server's website, relative to its root, for
    /// "Open in browser" and "Copy link". Null for screens the website has no
    /// standalone page for.
    /// </summary>
    public string? WebPath => this switch
    {
        Title title => $"title/{Uri.EscapeDataString(title.Id.MediaType.Value)}/{title.Id.TmdbId}",
        Person person => $"person/{person.TmdbId}",
        Company company => $"company/{company.TmdbId}",
        DiscoverList list => $"discover/{Uri.EscapeDataString(list.List.Value)}",
        _ => null,
    };

    /// <summary>What the placeholder page prints until the real page exists.</summary>
    public string Description => this switch
    {
        Title title => $"{title.Id.MediaType.Label} {title.Id.TmdbId}",
        Person person => Loc.Format("Nav_PlaceholderPerson", person.TmdbId),
        Company company => Loc.Format("Nav_PlaceholderStudio", company.TmdbId),
        Search search => Loc.Format("Nav_PlaceholderSearch", search.Query),
        DiscoverList list => list.Heading ?? list.List.Title,
        ErrorReference => Loc.Get("Errors_Title"),
        _ => ToString(),
    };
}

/// <summary>
/// What the main window does for the model: show a section's root page or
/// push a route. Implemented by <c>MainWindow</c>; the model only ever sees
/// this so view models can be exercised without a window.
/// </summary>
public interface INavigator
{
    /// <summary>Shows the section's root page, clearing anything pushed on top of the previous one.</summary>
    void ShowSection(Section section);

    /// <summary>Pushes the page for <paramref name="route"/> on the current section.</summary>
    void Open(Route route);

    bool CanGoBack { get; }

    void GoBack();

    /// <summary>Restores and activates the window (a notification was clicked).</summary>
    void BringToFront();
}
