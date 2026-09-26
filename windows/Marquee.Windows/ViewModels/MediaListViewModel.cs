using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// components/media-list.tsx: the person and studio pages' client-side
/// search, type filter and sort over the cards the server already sent
/// (api-v1.md section 5 says to do these locally). One instance per loaded
/// page; the pickers write into it and <see cref="Visible"/> follows.
/// </summary>
public sealed partial class MediaListViewModel : ObservableObject
{
    public static IReadOnlyList<string> TypeOptions { get; } = ["All", "Movies", "TV"];

    public static IReadOnlyList<string> OrderOptions { get; } =
        TitleListOrderExtensions.All.Select(order => order.Label()).ToList();

    private readonly AppModel model;
    private readonly IReadOnlyList<TitleCard> cards;
    private readonly ICommand openTitle;
    private readonly string singular;
    private readonly string plural;

    [ObservableProperty]
    private string query = "";

    /// <summary>Index into <see cref="TypeOptions"/>.</summary>
    [ObservableProperty]
    private int typeIndex;

    /// <summary>Index into <see cref="OrderOptions"/>; the website defaults to newest first.</summary>
    [ObservableProperty]
    private int orderIndex;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NoMatches))]
    [NotifyPropertyChangedFor(nameof(CountLabel))]
    private IReadOnlyList<PosterItem> visible = [];

    /// <param name="singular">"credit" / "title": the noun in the count.</param>
    /// <param name="emptyMessage">What to say when the server sent no cards at all.</param>
    public MediaListViewModel(AppModel model, IReadOnlyList<TitleCard> cards, string singular, string plural, string emptyMessage)
    {
        this.model = model;
        this.cards = cards;
        this.singular = singular;
        this.plural = plural;
        EmptyMessage = emptyMessage;
        openTitle = new RelayCommand<PosterItem>(item =>
        {
            if (item != null)
            {
                model.OpenTitle(item.Id);
            }
        });
        Rebuild();
    }

    /// <summary>The server sent nothing: the page shows <see cref="EmptyMessage"/> instead of the controls.</summary>
    public bool HasCards => cards.Count > 0;

    public string EmptyMessage { get; }

    /// <summary>Cards exist, but none pass the current filters.</summary>
    public bool NoMatches => HasCards && Visible.Count == 0;

    /// <summary>"12 credits".</summary>
    public string CountLabel => Format.Count(Visible.Count, singular, plural);

    partial void OnQueryChanged(string value) => Rebuild();

    partial void OnTypeIndexChanged(int value) => Rebuild();

    partial void OnOrderIndexChanged(int value) => Rebuild();

    private void Rebuild()
    {
        var wanted = TypeIndex switch
        {
            1 => MediaType.Movie,
            2 => MediaType.Tv,
            _ => (MediaType?)null,
        };
        var order = OrderIndex >= 0 && OrderIndex < TitleListOrderExtensions.All.Count
            ? TitleListOrderExtensions.All[OrderIndex]
            : TitleListOrder.NewestFirst;
        var needle = Query.Trim();

        var matching = cards.Where(card =>
            (wanted == null || card.MediaType == wanted)
            && (needle.Length == 0 || card.Name.Contains(needle, StringComparison.CurrentCultureIgnoreCase)));
        Visible = matching.SortedBy(order).Select(card => new PosterItem(model, card, openTitle)).ToList();
    }
}
