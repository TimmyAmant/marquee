using System.Globalization;
using System.Text.Json.Serialization;
using Marquee.Core.Localization;

namespace Marquee.Core.Models;

// The admin tools of 0.58 (api-v1.md): job schedules, the server's log,
// override rules, removing a title from Sonarr/Radarr, the blocklist's
// automatic rules, and the Gotify, Slack and Pushbullet channels. Mirrors
// mac/Marquee/API/Models/AdminToolsModels.swift. Every field an older
// server doesn't send is optional.

// MARK: Job schedules

/// <summary>
/// How often a job runs (<c>interval</c> of <c>GET /settings/jobs</c>, the
/// body of <c>PUT /settings/jobs/{id}</c>): every few minutes or hours
/// (<see cref="Every"/> and <see cref="Count"/>), or once a day at a time
/// of the server's clock (<see cref="DailyAt"/>).
/// </summary>
public sealed record JobInterval
{
    /// <summary><c>minutes</c> or <c>hours</c>; null for a daily time.</summary>
    public string? Every { get; init; }

    public int? Count { get; init; }

    public JobDailyTime? DailyAt { get; init; }

    public static IReadOnlyList<int> MinutePresets { get; } = [5, 10, 15, 30];
    public static IReadOnlyList<int> HourPresets { get; } = [1, 2, 3, 4, 6, 8, 12];

    public static JobInterval Minutes(int count) => new() { Every = "minutes", Count = count };
    public static JobInterval Hours(int count) => new() { Every = "hours", Count = count };
    public static JobInterval Daily(int hour, int minute) => new() { DailyAt = new JobDailyTime { Hour = hour, Minute = minute } };

    /// <summary>Every preset, then "Once a day" (at 3:00 until a time is picked): the menu's choices.</summary>
    public static IReadOnlyList<JobInterval> MenuChoices { get; } =
        [.. MinutePresets.Select(Minutes), .. HourPresets.Select(Hours), Daily(3, 0)];

    public bool IsDaily => DailyAt != null;

    /// <summary>The menu entry this belongs to (a daily one at any time is one entry).</summary>
    public string MenuKey => IsDaily ? "daily" : $"{Every}:{Count}";

    /// <summary>"Every 15 minutes", "Every hour", "Every 6 hours", "Once a day".</summary>
    public string MenuTitle
    {
        get
        {
            if (IsDaily)
            {
                return Loc.Get("Jobs_IntervalDaily");
            }
            var count = Count ?? 1;
            if (Every == "minutes")
            {
                return Loc.Format("Jobs_IntervalMinutes", count);
            }
            return count == 1 ? Loc.Get("Jobs_IntervalHour") : Loc.Format("Jobs_IntervalHours", count);
        }
    }

    /// <summary>The same schedule (records compare their nested time by value too).</summary>
    public bool SameAs(JobInterval? other) => other != null && MenuKey == other.MenuKey && DailyAt == other.DailyAt;
}

public sealed record JobDailyTime
{
    public required int Hour { get; init; }
    public required int Minute { get; init; }
}

/// <summary><c>PUT /settings/jobs/{id}</c> body: a null interval (sent as <c>null</c>) puts the job back to its default.</summary>
public sealed record JobIntervalBody
{
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public JobInterval? Interval { get; init; }
}

// MARK: Logs

public readonly record struct LogLevel(string Value) : IOpenEnum<LogLevel>
{
    public static readonly LogLevel Debug = new("debug");
    public static readonly LogLevel Info = new("info");
    public static readonly LogLevel Warn = new("warn");
    public static readonly LogLevel Error = new("error");

    public static IReadOnlyList<LogLevel> Known { get; } = [Debug, Info, Warn, Error];
    public static LogLevel FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string DisplayName
    {
        get
        {
            if (this == Debug) return Loc.Get("Logs_LevelDebug");
            if (this == Info) return Loc.Get("Logs_LevelInfo");
            if (this == Warn) return Loc.Get("Logs_LevelWarn");
            if (this == Error) return Loc.Get("Logs_LevelError");
            return OpenEnum.Capitalized(Value);
        }
    }
}

/// <summary>One line of <c>GET /settings/logs</c>, secrets already masked.</summary>
public sealed record LogEntry
{
    public required int Id { get; init; }
    public required DateTimeOffset Time { get; init; }
    public required LogLevel Level { get; init; }

    /// <summary>The subsystem ("plex-sync"), or "server".</summary>
    public required string Source { get; init; }

    public required string Message { get; init; }

    /// <summary>How Copy and Save write it.</summary>
    public string TextLine =>
        $"{Time.ToString("O", CultureInfo.InvariantCulture)} {Level.Value.ToUpperInvariant()} [{Source}] {Message}";
}

public sealed record LogsResponse
{
    public required IReadOnlyList<LogEntry> Results { get; init; }

    /// <summary>The newest line's id, whatever the filter: the next <c>after</c>.</summary>
    public required int LatestId { get; init; }
}

// MARK: Override rules

public sealed record RuleKeyword
{
    public required int Id { get; init; }
    public required string Name { get; init; }
}

/// <summary>
/// A rule of <c>GET /settings/override-rules</c>: requests whose title and
/// requester match go to <see cref="ServerId"/> with these picks (null keeps
/// the server's default). Empty lists are "any".
/// </summary>
public sealed record OverrideRule
{
    public string Id { get; init; } = "";
    public required string ServerId { get; init; }
    public required string Name { get; init; }
    public bool Enabled { get; init; } = true;
    public IReadOnlyList<int> Genres { get; init; } = [];
    public IReadOnlyList<string> Languages { get; init; } = [];
    public IReadOnlyList<RuleKeyword> Keywords { get; init; } = [];
    public IReadOnlyList<string> UserIds { get; init; } = [];
    public int? QualityProfileId { get; init; }
    public string? RootFolderPath { get; init; }
    public IReadOnlyList<int>? Tags { get; init; }
    public int Position { get; init; }

    public bool HasConditions => Genres.Count > 0 || Languages.Count > 0 || Keywords.Count > 0 || UserIds.Count > 0;
}

/// <summary><c>POST /settings/override-rules</c> and <c>PUT …/{id}</c> body; nulls are sent, clearing a pick.</summary>
public sealed record OverrideRuleBody
{
    public required string ServerId { get; init; }
    public required string Name { get; init; }
    public required bool Enabled { get; init; }
    public required IReadOnlyList<int> Genres { get; init; }
    public required IReadOnlyList<string> Languages { get; init; }
    public required IReadOnlyList<RuleKeyword> Keywords { get; init; }
    public required IReadOnlyList<string> UserIds { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public int? QualityProfileId { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? RootFolderPath { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IReadOnlyList<int>? Tags { get; init; }

    public static OverrideRuleBody From(OverrideRule rule) => new()
    {
        ServerId = rule.ServerId,
        Name = rule.Name.Trim(),
        Enabled = rule.Enabled,
        Genres = rule.Genres,
        Languages = rule.Languages,
        Keywords = rule.Keywords,
        UserIds = rule.UserIds,
        QualityProfileId = rule.QualityProfileId,
        RootFolderPath = rule.RootFolderPath,
        Tags = rule.Tags is { Count: > 0 } tags ? tags : null,
    };
}

public sealed record OverrideRuleSaved
{
    public required OverrideRule Rule { get; init; }
}

/// <summary><c>rule</c> of <c>GET /titles/…/add-options</c> (0.58+): the override rule a request goes by.</summary>
public sealed record AddOptionsRule
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string ServerId { get; init; }
}

// MARK: Remove from Sonarr/Radarr

public sealed record RemoveFromArrBody
{
    public required bool DeleteFiles { get; init; }
    public bool? Is4k { get; init; }
}

public sealed record RemoveFromArrResult
{
    /// <summary>The servers that took it off.</summary>
    public required IReadOnlyList<string> RemovedFrom { get; init; }

    /// <summary>The ones that had it but didn't.</summary>
    public IReadOnlyList<string> Failed { get; init; } = [];

    public int RequestsMarked { get; init; }
}

// MARK: Blocking automatically

/// <summary><c>POST /settings/blocklist</c> (and <c>/preview</c>) with a <c>kind</c> (0.58+): keyword, certification or adult.</summary>
public sealed record BlockRuleBody
{
    public required string Kind { get; init; }
    public string? Keyword { get; init; }
    public string? Region { get; init; }
    public string? Certification { get; init; }
    public string? Reason { get; init; }
}

public sealed record BlockPreviewTitle
{
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public string? Year { get; init; }

    public string Label => Year.NonBlank() is { } year ? $"{Name} ({year})" : Name;
}

public sealed record BlockPreviewRequest
{
    public required string Id { get; init; }
    public required string Title { get; init; }
}

/// <summary><c>POST /settings/blocklist/preview</c>: what a rule would block.</summary>
public sealed record BlockPreview
{
    public required IReadOnlyList<BlockPreviewTitle> Titles { get; init; }
    public required int Scanned { get; init; }
    public required int Matched { get; init; }
    public IReadOnlyList<BlockPreviewRequest> PendingRequests { get; init; } = [];
}

// MARK: Gotify, Slack, Pushbullet

/// <summary>Gotify as saved (never the token).</summary>
public sealed record GotifySettings
{
    public required bool Connected { get; init; }
    public string? Url { get; init; }
    public int? Priority { get; init; }
}

/// <summary>Pushbullet as saved (never the token).</summary>
public sealed record PushbulletSettings
{
    public required bool Connected { get; init; }
    public string? ChannelTag { get; init; }
}

/// <summary><c>PUT /settings/integrations/gotify</c>: a blank token keeps the saved one for the same server.</summary>
public sealed record GotifySettingRequest(string Url, string AppToken, int Priority);

/// <summary><c>PUT /settings/integrations/slack</c>: a blank URL keeps the saved one.</summary>
public sealed record SlackSettingRequest(string WebhookUrl);

/// <summary><c>PUT /settings/integrations/pushbullet</c>: a blank token keeps the saved one.</summary>
public sealed record PushbulletSettingRequest(string AccessToken, string ChannelTag);
