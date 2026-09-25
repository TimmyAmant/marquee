using Marquee.Core.Models;

namespace Marquee.Windows.Services;

/// <summary>The NavigationView's sections, the counterpart of the Mac app's <c>SidebarItem</c> plus Search and Settings.</summary>
public enum Section
{
    Discover,
    Movies,
    Series,
    Search,
    Requests,
    Favorites,
    Calendar,
    Settings,
}

public static class SectionExtensions
{
    /// <summary>The NavigationViewItem's <c>Tag</c> in MainWindow.xaml.</summary>
    public static string Tag(this Section section) => section.ToString().ToLowerInvariant();

    /// <summary>The label in the pane and the page heading.</summary>
    public static string Title(this Section section) => section switch
    {
        Section.Discover => "Discover",
        Section.Movies => "Movies",
        Section.Series => "Series",
        Section.Search => "Search",
        Section.Requests => "Requests",
        Section.Favorites => "Favorites",
        Section.Calendar => "Calendar",
        Section.Settings => "Settings",
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
    /// The same page on the server's website, relative to its root, for
    /// "Open in browser" and "Copy link". Null for screens the website has no
    /// standalone page for.
    /// </summary>
    public string? WebPath => this switch
    {
        Title title => $"title/{Uri.EscapeDataString(title.Id.MediaType.Value)}/{title.Id.TmdbId}",
        Person person => $"person/{person.TmdbId}",
        Company company => $"company/{company.TmdbId}",
        _ => null,
    };

    /// <summary>What the placeholder page prints until the real page exists.</summary>
    public string Description => this switch
    {
        Title title => $"{title.Id.MediaType.Label} {title.Id.TmdbId}",
        Person person => $"Person {person.TmdbId}",
        Company company => $"Studio {company.TmdbId}",
        Search search => $"Search results for \"{search.Query}\"",
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
}
