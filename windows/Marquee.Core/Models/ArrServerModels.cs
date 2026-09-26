using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

// Any number of Sonarr and Radarr servers (api-v1.md section 12, "Sonarr /
// Radarr servers (0.43+)"), and the "Advanced" add overrides that pick one
// of them when approving a request or adding a title (section 4 and 7). A
// server older than 0.43 has none of this: GET /settings/integrations omits
// `arrServers` (the four fixed cards stay) and the new endpoints are 404
// (Advanced stays hidden).

/// <summary>A Sonarr/Radarr tag, as the pickers list them.</summary>
public sealed record ArrTag
{
    public required int Id { get; init; }
    public required string Label { get; init; }
}

/// <summary>
/// <c>ArrServer</c>: one Sonarr or Radarr, with the settings used when a
/// title is added to it. The API key is never returned.
/// </summary>
public sealed record ArrServer
{
    public required string Id { get; init; }

    /// <summary><see cref="ArrProvider.Sonarr"/> or <see cref="ArrProvider.Radarr"/>.</summary>
    public required ArrProvider Kind { get; init; }

    /// <summary>Shown everywhere a server is named ("Radarr 2").</summary>
    public required string Name { get; init; }

    public required string BaseUrl { get; init; }

    /// <summary>Always true: a server can't be saved without its key.</summary>
    public bool HasApiKey { get; init; } = true;

    /// <summary>4K requests and "Add in 4K" go to a 4K server.</summary>
    public required bool Is4k { get; init; }

    /// <summary>Where titles go when nobody picks a server (one per kind and 4K-ness).</summary>
    public required bool IsDefault { get; init; }

    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }

    /// <summary>Tag ids added with every title.</summary>
    public IReadOnlyList<int> Tags { get; init; } = [];

    /// <summary>Sonarr: the series type for non-anime shows. Radarr: null.</summary>
    public SeriesType? SeriesType { get; init; }

    /// <summary>Sonarr: sort episodes into season folders. Radarr: null.</summary>
    public bool? SeasonFolders { get; init; }

    /// <summary>Sonarr: used instead for anime shows (null = the regular one).</summary>
    public int? AnimeQualityProfileId { get; init; }

    /// <summary>Sonarr: used instead for anime shows (null = the regular one).</summary>
    public string? AnimeRootFolderPath { get; init; }

    /// <summary>Sonarr: tags for anime shows, used instead of <see cref="Tags"/> when not empty.</summary>
    public IReadOnlyList<int> AnimeTags { get; init; } = [];

    /// <summary>A quality profile and root folder are picked (required for adding titles).</summary>
    public required bool FullyConfigured { get; init; }

    /// <summary>This server's own webhook URL, with its own secret.</summary>
    public required string WebhookUrl { get; init; }

    public bool IsSonarr => Kind == ArrProvider.Sonarr;
}

/// <summary>
/// <c>GET /settings/arr-servers/{id}/options</c>: a saved server's pickers.
/// Also what <see cref="ArrServerTestResult.Options"/> gives.
/// </summary>
public sealed record ArrServerOptions
{
    public required IReadOnlyList<QualityProfile> QualityProfiles { get; init; }
    public required IReadOnlyList<RootFolder> RootFolders { get; init; }
    public IReadOnlyList<ArrTag> Tags { get; init; } = [];
}

/// <summary><c>POST /settings/arr-servers/test</c>: the connection works, and what the pickers need.</summary>
public sealed record ArrServerTestResult
{
    public required bool Ok { get; init; }

    /// <summary>Sonarr/Radarr's version, e.g. "5.26.2.10099".</summary>
    public string? Version { get; init; }

    public required IReadOnlyList<QualityProfile> QualityProfiles { get; init; }
    public required IReadOnlyList<RootFolder> RootFolders { get; init; }
    public IReadOnlyList<ArrTag> Tags { get; init; } = [];

    public ArrServerOptions Options => new() { QualityProfiles = QualityProfiles, RootFolders = RootFolders, Tags = Tags };
}

/// <summary><c>POST /settings/arr-servers</c> and <c>PATCH …/{id}</c>: <c>{ "ok": true, "server": ArrServer }</c>.</summary>
public sealed record ArrServerSaved
{
    public required bool Ok { get; init; }
    public required ArrServer Server { get; init; }
}

/// <summary><c>POST /settings/arr-servers/{id}/webhook-secret</c>: the server's new webhook URL.</summary>
public sealed record ArrServerWebhook
{
    public required bool Ok { get; init; }
    public required string WebhookUrl { get; init; }
}

/// <summary>
/// <c>POST /settings/arr-servers/test</c> body. Editing a saved server
/// without typing its key again, <see cref="ServerId"/> stands in for
/// <see cref="ApiKey"/> (only while the URL is its saved one).
/// </summary>
public sealed record ArrServerTestRequest(ArrProvider Kind, string BaseUrl, string? ApiKey = null, string? ServerId = null);

/// <summary><c>POST /settings/arr-servers</c> body ("Add server"). Null fields are left out: the server's defaults.</summary>
public sealed record ArrServerCreateRequest
{
    public required ArrProvider Kind { get; init; }
    public required string BaseUrl { get; init; }
    public required string ApiKey { get; init; }

    /// <summary>Blank = "Sonarr" / "Radarr" / "4K Sonarr" / "4K Radarr", numbered when taken.</summary>
    public string? Name { get; init; }

    public bool? Is4k { get; init; }
    public bool? IsDefault { get; init; }
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int>? Tags { get; init; }
    public SeriesType? SeriesType { get; init; }
    public bool? SeasonFolders { get; init; }
    public int? AnimeQualityProfileId { get; init; }
    public string? AnimeRootFolderPath { get; init; }
    public IReadOnlyList<int>? AnimeTags { get; init; }
}

/// <summary>
/// <c>PATCH /settings/arr-servers/{id}</c> body: a null field is left out
/// (unchanged), and a blank key keeps the saved one. The two anime pickers
/// can be cleared ("Same as above"), which takes an explicit JSON
/// <c>null</c>: <see cref="ClearableInt"/> / <see cref="ClearableString"/>.
/// </summary>
public sealed record ArrServerUpdateRequest
{
    public string? Name { get; init; }
    public string? BaseUrl { get; init; }
    public string? ApiKey { get; init; }
    public bool? Is4k { get; init; }
    public bool? IsDefault { get; init; }
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int>? Tags { get; init; }
    public SeriesType? SeriesType { get; init; }
    public bool? SeasonFolders { get; init; }
    public ClearableInt? AnimeQualityProfileId { get; init; }
    public ClearableString? AnimeRootFolderPath { get; init; }
    public IReadOnlyList<int>? AnimeTags { get; init; }
}

/// <summary>A number, or an explicit JSON <c>null</c> that clears the setting (see <see cref="QuotaLimit"/>).</summary>
[JsonConverter(typeof(ClearableIntConverter))]
public readonly record struct ClearableInt(int? Value);

/// <summary>A string, or an explicit JSON <c>null</c> that clears the setting.</summary>
[JsonConverter(typeof(ClearableStringConverter))]
public readonly record struct ClearableString(string? Value);

internal sealed class ClearableIntConverter : JsonConverter<ClearableInt>
{
    public override bool HandleNull => true;

    public override ClearableInt Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? new(null) : new(reader.GetInt32());

    public override void Write(Utf8JsonWriter writer, ClearableInt value, JsonSerializerOptions options)
    {
        if (value.Value is { } number)
        {
            writer.WriteNumberValue(number);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}

internal sealed class ClearableStringConverter : JsonConverter<ClearableString>
{
    public override bool HandleNull => true;

    public override ClearableString Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? new(null) : new(reader.GetString());

    public override void Write(Utf8JsonWriter writer, ClearableString value, JsonSerializerOptions options)
    {
        if (value.Value is { } text)
        {
            writer.WriteStringValue(text);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}

/// <summary>
/// The Add/Edit server form (the website's Download Clients form): what's
/// typed and picked, and the bodies it turns into. Test loads the pickers'
/// choices with <see cref="ApplyOptions"/>; Save is <see cref="CreateRequest"/>
/// for a new server and <see cref="UpdateRequest"/> for a saved one.
/// </summary>
public sealed class ArrServerDraft
{
    public const string SavedKeyPlaceholder = "Saved — enter to replace";
    public const string KeyAgainMessage = "Enter the API key again to change the URL.";

    /// <summary>A new server of this kind.</summary>
    public ArrServerDraft(ArrProvider kind)
    {
        Kind = kind;
        SeriesType = SeriesType.Standard;
        SeasonFolders = true;
    }

    /// <summary>Editing a saved server: everything but its key, which is never returned.</summary>
    public ArrServerDraft(ArrServer saved)
    {
        Kind = saved.Kind;
        Saved = saved;
        Name = saved.Name;
        BaseUrl = saved.BaseUrl;
        Is4k = saved.Is4k;
        IsDefault = saved.IsDefault;
        QualityProfileId = saved.QualityProfileId;
        RootFolderPath = saved.RootFolderPath;
        Tags = [.. saved.Tags];
        SeriesType = saved.SeriesType ?? SeriesType.Standard;
        SeasonFolders = saved.SeasonFolders ?? true;
        AnimeQualityProfileId = saved.AnimeQualityProfileId;
        AnimeRootFolderPath = saved.AnimeRootFolderPath;
        AnimeTags = [.. saved.AnimeTags];
    }

    public ArrProvider Kind { get; }

    /// <summary>The server being edited; null for a new one.</summary>
    public ArrServer? Saved { get; }

    public bool IsEditing => Saved != null;
    public bool IsSonarr => Kind == ArrProvider.Sonarr;

    public string Name { get; set; } = "";
    public string BaseUrl { get; set; } = "";

    /// <summary>Blank while editing keeps the saved key.</summary>
    public string ApiKey { get; set; } = "";

    public bool Is4k { get; set; }
    public bool IsDefault { get; set; }
    public int? QualityProfileId { get; set; }
    public string? RootFolderPath { get; set; }
    public List<int> Tags { get; set; } = [];
    public SeriesType SeriesType { get; set; }
    public bool SeasonFolders { get; set; }

    /// <summary>Null: "Same as above".</summary>
    public int? AnimeQualityProfileId { get; set; }

    /// <summary>Null: "Same as above".</summary>
    public string? AnimeRootFolderPath { get; set; }

    public List<int> AnimeTags { get; set; } = [];

    /// <summary>The pickers' choices, once Test (or the saved server's options) answered.</summary>
    public ArrServerOptions? Options { get; private set; }

    /// <summary>"Saved — enter to replace" while editing; nothing for a new server.</summary>
    public string ApiKeyPlaceholder => IsEditing ? SavedKeyPlaceholder : "";

    /// <summary>"http://localhost:8989" / "http://localhost:7878".</summary>
    public string BaseUrlPlaceholder => Kind.DefaultPort is { } port ? $"http://localhost:{port}" : "";

    private bool HasNewKey => ApiKey.Trim().Length > 0;

    /// <summary>The URL isn't the saved one (trailing slashes aside): the key has to be typed again.</summary>
    public bool UrlChanged => Saved is { } saved && Trimmed(BaseUrl) != Trimmed(saved.BaseUrl);

    /// <summary>"Enter the API key again to change the URL." applies: the URL changed and no key is typed.</summary>
    public bool NeedsKeyAgain => UrlChanged && !HasNewKey;

    private static string Trimmed(string url) => url.Trim().TrimEnd('/');

    /// <summary>
    /// "Test": the typed key, or while editing without one the saved
    /// server's id (the server refuses that for a changed URL, with
    /// <see cref="KeyAgainMessage"/>).
    /// </summary>
    public ArrServerTestRequest TestRequest() =>
        Saved is { } saved && !HasNewKey
            ? new ArrServerTestRequest(Kind, BaseUrl.Trim(), ServerId: saved.Id)
            : new ArrServerTestRequest(Kind, BaseUrl.Trim(), ApiKey.Trim());

    /// <summary>
    /// Fills the pickers: an unpicked (or no longer listed) quality profile
    /// or root folder becomes the first one, an anime one no longer listed
    /// goes back to "Same as above", and tags the server doesn't have are
    /// dropped.
    /// </summary>
    public void ApplyOptions(ArrServerOptions options)
    {
        Options = options;
        if (QualityProfileId is not { } profile || options.QualityProfiles.All(candidate => candidate.Id != profile))
        {
            QualityProfileId = options.QualityProfiles.Count > 0 ? options.QualityProfiles[0].Id : null;
        }
        if (RootFolderPath is not { } folder || options.RootFolders.All(candidate => candidate.Path != folder))
        {
            RootFolderPath = options.RootFolders.Count > 0 ? options.RootFolders[0].Path : null;
        }
        if (AnimeQualityProfileId is { } animeProfile && options.QualityProfiles.All(candidate => candidate.Id != animeProfile))
        {
            AnimeQualityProfileId = null;
        }
        if (AnimeRootFolderPath is { } animeFolder && options.RootFolders.All(candidate => candidate.Path != animeFolder))
        {
            AnimeRootFolderPath = null;
        }
        var known = options.Tags.Select(tag => tag.Id).ToHashSet();
        Tags = Tags.Where(known.Contains).ToList();
        AnimeTags = AnimeTags.Where(known.Contains).ToList();
    }

    /// <summary>"Add server": only what's set, and the Sonarr fields only for Sonarr.</summary>
    public ArrServerCreateRequest CreateRequest() => new()
    {
        Kind = Kind,
        BaseUrl = BaseUrl.Trim(),
        ApiKey = ApiKey.Trim(),
        Name = Name.Trim().NonBlank(),
        Is4k = Is4k,
        IsDefault = IsDefault ? true : null,
        QualityProfileId = QualityProfileId,
        RootFolderPath = RootFolderPath,
        Tags = Tags.Order().ToList(),
        SeriesType = IsSonarr ? SeriesType : null,
        SeasonFolders = IsSonarr ? SeasonFolders : null,
        AnimeQualityProfileId = IsSonarr ? AnimeQualityProfileId : null,
        AnimeRootFolderPath = IsSonarr ? AnimeRootFolderPath : null,
        AnimeTags = IsSonarr ? AnimeTags.Order().ToList() : null,
    };

    /// <summary>
    /// "Save" on a saved server: the whole form, except a blank name or key
    /// (unchanged) and Default unless it was switched (turning it off on the
    /// default is the server's "Make another server the default instead.").
    /// </summary>
    public ArrServerUpdateRequest UpdateRequest() => new()
    {
        Name = Name.Trim().NonBlank(),
        BaseUrl = BaseUrl.Trim(),
        ApiKey = ApiKey.Trim().NonBlank(),
        Is4k = Is4k,
        IsDefault = Saved?.IsDefault == IsDefault ? null : IsDefault,
        QualityProfileId = QualityProfileId,
        RootFolderPath = RootFolderPath,
        Tags = Tags.Order().ToList(),
        SeriesType = IsSonarr ? SeriesType : null,
        SeasonFolders = IsSonarr ? SeasonFolders : null,
        AnimeQualityProfileId = IsSonarr ? new ClearableInt(AnimeQualityProfileId) : null,
        AnimeRootFolderPath = IsSonarr ? new ClearableString(AnimeRootFolderPath) : null,
        AnimeTags = IsSonarr ? AnimeTags.Order().ToList() : null,
    };
}

// MARK: Add overrides (Approve's and the admin's Add's "Advanced")

/// <summary>
/// <c>GET /titles/{type}/{tmdbId}/add-options</c>: every server that could
/// take the title (default first), each with its pickers and the values it
/// would use if nothing is changed.
/// </summary>
public sealed record AddOptions
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required bool Is4k { get; init; }

    /// <summary>An anime show: <c>defaults</c> are then the servers' anime ones.</summary>
    public required bool IsAnime { get; init; }

    /// <summary>Empty when none is set up for this type.</summary>
    public required IReadOnlyList<AddServerOption> Servers { get; init; }
}

/// <summary>One server under <see cref="AddOptions.Servers"/>.</summary>
public sealed record AddServerOption
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required bool IsDefault { get; init; }
    public required bool Is4k { get; init; }

    /// <summary>False: it didn't answer in time; its lists are empty but <see cref="Defaults"/> still hold its saved choices.</summary>
    public required bool Reachable { get; init; }

    public IReadOnlyList<QualityProfile> QualityProfiles { get; init; } = [];
    public IReadOnlyList<RootFolder> RootFolders { get; init; } = [];
    public IReadOnlyList<ArrTag> Tags { get; init; } = [];
    public required AddDefaults Defaults { get; init; }

    /// <summary>"Radarr 2", or "Radarr 2 (not responding)".</summary>
    public string DisplayName => Reachable ? Name : $"{Name} (not responding)";
}

/// <summary>What a server would use for this title if nothing is picked.</summary>
public sealed record AddDefaults
{
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int> Tags { get; init; } = [];

    /// <summary>Null for movies.</summary>
    public SeriesType? SeriesType { get; init; }
}

/// <summary>
/// <c>POST /requests/{id}/approve</c>'s optional body: where and how the
/// title is added. Every field is optional (null is left out: the server's
/// default); no body at all is the plain Approve.
/// </summary>
public sealed record AddOverrides
{
    public string? ServerId { get; init; }
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }

    /// <summary>Tag ids of that server; empty means no tags.</summary>
    public IReadOnlyList<int>? Tags { get; init; }

    /// <summary>TV only.</summary>
    public SeriesType? SeriesType { get; init; }
}

/// <summary><c>POST /titles/{type}/{tmdbId}/add</c> body with overrides (0.43+): <see cref="AddOverrides"/> plus the 4K flag.</summary>
public sealed record TitleAddRequest
{
    /// <summary>True for "Add to 4K …"; left out otherwise.</summary>
    public bool? Is4k { get; init; }

    public string? ServerId { get; init; }
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int>? Tags { get; init; }
    public SeriesType? SeriesType { get; init; }

    public static TitleAddRequest From(AddOverrides overrides, bool is4k) => new()
    {
        Is4k = is4k ? true : null,
        ServerId = overrides.ServerId,
        QualityProfileId = overrides.QualityProfileId,
        RootFolderPath = overrides.RootFolderPath,
        Tags = overrides.Tags,
        SeriesType = overrides.SeriesType,
    };
}

/// <summary>
/// The "Advanced" section's picks over one <see cref="AddOptions"/>: the
/// default server to begin with, and its <c>defaults</c>; picking another
/// server resets the other picks to that server's. The pickers are plain
/// lists with an index, the way the app's combo boxes bind.
/// </summary>
public sealed class AddOverridesSelection
{
    public static IReadOnlyList<SeriesType> SeriesTypes { get; } = [Models.SeriesType.Standard, Models.SeriesType.Daily, Models.SeriesType.Anime];

    private readonly HashSet<int> tags = [];

    public AddOverridesSelection(AddOptions options)
    {
        Options = options;
        Server = options.Servers.FirstOrDefault(server => server.IsDefault) ?? options.Servers.FirstOrDefault();
        ResetToServerDefaults();
    }

    public AddOptions Options { get; }
    public IReadOnlyList<AddServerOption> Servers => Options.Servers;

    /// <summary>No server takes this type ("Connect Radarr in Settings first." on Approve).</summary>
    public bool HasServers => Servers.Count > 0;

    /// <summary>Series type is a Sonarr pick.</summary>
    public bool IsTv => Options.MediaType == MediaType.Tv;

    public AddServerOption? Server { get; private set; }
    public int? QualityProfileId { get; set; }
    public string? RootFolderPath { get; set; }
    public SeriesType? SeriesType { get; set; }
    public IReadOnlyCollection<int> Tags => tags;

    // MARK: Server

    public IReadOnlyList<string> ServerNames => Servers.Select(server => server.DisplayName).ToList();

    public int ServerIndex
    {
        get => Server == null ? -1 : IndexOf(Servers, Server);
        set
        {
            if (value >= 0 && value < Servers.Count && !ReferenceEquals(Servers[value], Server))
            {
                SelectServer(Servers[value].Id);
            }
        }
    }

    /// <summary>Picks a server by id and resets every other pick to its <c>defaults</c>.</summary>
    public void SelectServer(string id)
    {
        if (Servers.FirstOrDefault(server => server.Id == id) is not { } server)
        {
            return;
        }
        Server = server;
        ResetToServerDefaults();
    }

    private void ResetToServerDefaults()
    {
        var defaults = Server?.Defaults;
        QualityProfileId = defaults?.QualityProfileId;
        RootFolderPath = defaults?.RootFolderPath;
        tags.Clear();
        foreach (var tag in defaults?.Tags ?? [])
        {
            tags.Add(tag);
        }
        SeriesType = IsTv ? defaults?.SeriesType ?? (Options.IsAnime ? Models.SeriesType.Anime : Models.SeriesType.Standard) : null;
    }

    // MARK: Pickers

    public IReadOnlyList<QualityProfile> QualityProfiles => Server?.QualityProfiles ?? [];
    public IReadOnlyList<RootFolder> RootFolders => Server?.RootFolders ?? [];
    public IReadOnlyList<ArrTag> AvailableTags => Server?.Tags ?? [];

    public IReadOnlyList<string> QualityProfileNames => QualityProfiles.Select(profile => profile.Name).ToList();
    public IReadOnlyList<string> RootFolderPaths => RootFolders.Select(folder => folder.Path).ToList();
    public IReadOnlyList<string> SeriesTypeLabels => SeriesTypes.Select(type => type.Label).ToList();

    /// <summary>-1 while the pick isn't listed (an unreachable server lists nothing).</summary>
    public int QualityProfileIndex
    {
        get => QualityProfileId is { } id ? IndexWhere(QualityProfiles, profile => profile.Id == id) : -1;
        set
        {
            if (value >= 0 && value < QualityProfiles.Count)
            {
                QualityProfileId = QualityProfiles[value].Id;
            }
        }
    }

    public int RootFolderIndex
    {
        get => RootFolderPath is { } path ? IndexWhere(RootFolders, folder => folder.Path == path) : -1;
        set
        {
            if (value >= 0 && value < RootFolders.Count)
            {
                RootFolderPath = RootFolders[value].Path;
            }
        }
    }

    public int SeriesTypeIndex
    {
        get => SeriesType is { } type ? IndexWhere(SeriesTypes, candidate => candidate == type) : -1;
        set
        {
            if (value >= 0 && value < SeriesTypes.Count)
            {
                SeriesType = SeriesTypes[value];
            }
        }
    }

    public bool HasTag(int id) => tags.Contains(id);

    public void SetTag(int id, bool on)
    {
        if (on)
        {
            tags.Add(id);
        }
        else
        {
            tags.Remove(id);
        }
    }

    /// <summary>What Approve / Add sends: the picked server and every pick; null without a server.</summary>
    public AddOverrides? Overrides => Server is { } server
        ? new AddOverrides
        {
            ServerId = server.Id,
            QualityProfileId = QualityProfileId,
            RootFolderPath = RootFolderPath,
            Tags = tags.Order().ToList(),
            SeriesType = IsTv ? SeriesType : null,
        }
        : null;

    private static int IndexOf<T>(IReadOnlyList<T> list, T item) where T : class => IndexWhere(list, candidate => ReferenceEquals(candidate, item));

    private static int IndexWhere<T>(IReadOnlyList<T> list, Func<T, bool> match)
    {
        for (var index = 0; index < list.Count; index++)
        {
            if (match(list[index]))
            {
                return index;
            }
        }
        return -1;
    }
}
