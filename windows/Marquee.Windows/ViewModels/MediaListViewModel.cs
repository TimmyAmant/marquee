using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>What <see cref="MediaListViewModel.CountLabel"/> counts: "12 credits" or "12 titles".</summary>
public enum MediaListNoun
{
    Credit,
    Title,
}

/// <summary>
/// components/media-list.tsx: the person and studio pages' client-side
/// search, type filter and sort over the cards the server already sent
/// (api-v1.md section 5 says to do these locally). One instance per loaded
/// page; the pickers write into it and <see cref="Visible"/> follows.
/// </summary>
public sealed partial class MediaListViewModel : ObservableObject
{
    public static IReadOnlyList<string> TypeOptions => [Loc.Get("Media_TypeAll"), Loc.Get("Media_TypeMovies"), Loc.Get("Media_TypeTv")];

    public static IReadOnlyList<string> OrderOptions { get; } =
        TitleListOrderExtensions.All.Select(order => order.Label()).ToList();

    private readonly AppModel model;
    private readonly IReadOnlyList<TitleCard> cards;
    private readonly ICommand openTitle;
    private readonly MediaListNoun noun;

    /// <summary>lib/tmdb/credit-kind.ts, in menu order; "all" is everything.</summary>
    private static readonly string[] RoleKinds = ["acting", "self", "crew", "all"];

    private static string RoleLabel(string kind) => kind switch
    {
        "acting" => Loc.Get("Media_RoleActing"),
        "self" => Loc.Get("Media_RoleSelf"),
        "crew" => Loc.Get("Media_RoleCrew"),
        _ => Loc.Get("Media_RoleAll"),
    };

    /// <summary>The Roles menu's kinds: only those this person has, empty
    /// when there's no menu (not a person, an older server, one kind).</summary>
    private readonly IReadOnlyList<string> roleKinds;

    [ObservableProperty]
    private string query = "";

    /// <summary>Index into <see cref="TypeOptions"/>.</summary>
    [ObservableProperty]
    private int typeIndex;

    /// <summary>Index into <see cref="RoleOptions"/>.</summary>
    [ObservableProperty]
    private int roleIndex;

    /// <summary>Index into <see cref="OrderOptions"/>; the website defaults to newest first.</summary>
    [ObservableProperty]
    private int orderIndex;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NoMatches))]
    [NotifyPropertyChangedFor(nameof(CountLabel))]
    private IReadOnlyList<PosterItem> visible = [];

    /// <param name="noun">What the count counts: credits or titles.</param>
    /// <param name="emptyMessage">What to say when the server sent no cards at all.</param>
    /// <param name="defaultRoleFilter">A person's page: shows the Roles menu, opened on this kind.</param>
    public MediaListViewModel(AppModel model, IReadOnlyList<TitleCard> cards, MediaListNoun noun, string emptyMessage, string? defaultRoleFilter = null)
    {
        this.model = model;
        this.cards = cards;
        this.noun = noun;
        EmptyMessage = emptyMessage;
        var kinds = defaultRoleFilter == null
            ? new List<string>()
            : RoleKinds.Where(kind => kind == "all" || cards.Any(card => card.CreditKinds?.Contains(kind) == true)).ToList();
        roleKinds = kinds.Count > 1 ? kinds : [];
        RoleOptions = roleKinds.Select(RoleLabel).ToList();
        roleIndex = Math.Max(0, roleKinds.ToList().IndexOf(defaultRoleFilter ?? "all"));
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

    /// <summary>The Roles menu's labels; empty hides the menu.</summary>
    public IReadOnlyList<string> RoleOptions { get; }

    public bool HasRoleOptions => RoleOptions.Count > 0;

    /// <summary>Cards exist, but none pass the current filters.</summary>
    public bool NoMatches => HasCards && Visible.Count == 0;

    /// <summary>"12 credits".</summary>
    public string CountLabel => noun == MediaListNoun.Credit
        ? Loc.Plural("Media_CreditCount", Visible.Count)
        : Loc.Plural("Media_TitleCount", Visible.Count);

    partial void OnQueryChanged(string value) => Rebuild();

    partial void OnTypeIndexChanged(int value) => Rebuild();

    partial void OnRoleIndexChanged(int value) => Rebuild();

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
        var role = RoleIndex >= 0 && RoleIndex < roleKinds.Count ? roleKinds[RoleIndex] : "all";

        var matching = cards.Where(card =>
            (role == "all" || card.CreditKinds == null || card.CreditKinds.Contains(role))
            && (wanted == null || card.MediaType == wanted)
            && (needle.Length == 0 || card.Name.Contains(needle, StringComparison.CurrentCultureIgnoreCase)));
        Visible = matching.SortedBy(order).Select(card => new PosterItem(model, card, openTitle)).ToList();
    }
}
