using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One row of the season picker's table: a checkbox (enabled when the
/// season can be requested), the name, the episode count and a status pill.
/// </summary>
public sealed partial class SeasonPickerRow : ObservableObject
{
    private readonly Action<SeasonPickerRow> changed;

    /// <summary>The checkbox; two-way bound, and every change is reported to the dialog.</summary>
    [ObservableProperty]
    private bool? isChecked = false;

    public SeasonPickerRow(SeasonSummary season, Action<SeasonPickerRow> changed)
        : this(season.SeasonNumber, season.Name, season.EpisodeCount, season.RequestState, changed)
    {
    }

    /// <summary>A row of the edit dialog (<c>GET /requests/{id}/edit-options</c>'s <c>seasonRows</c>).</summary>
    public SeasonPickerRow(RequestEditSeasonRow row, Action<SeasonPickerRow> changed)
        : this(row.SeasonNumber, row.Name, row.EpisodeCount, row.State.PickerState, changed)
    {
    }

    private SeasonPickerRow(int seasonNumber, string name, int episodeCount, SeasonRequestState state, Action<SeasonPickerRow> changed)
    {
        this.changed = changed;
        SeasonNumber = seasonNumber;
        Name = name;
        EpisodeLine = Loc.Plural("Season_EpisodeCount", episodeCount);
        EpisodeCountText = episodeCount.ToString(System.Globalization.CultureInfo.CurrentCulture);
        IsRequestable = state == SeasonRequestState.Requestable;
        Pill = state.PillLabel();
        PillTone = state switch
        {
            SeasonRequestState.InLibrary => BadgeTone.Owned,
            SeasonRequestState.Monitored => BadgeTone.Downloading,
            SeasonRequestState.Requested => BadgeTone.Info,
            _ => BadgeTone.Neutral,
        };
    }

    public int SeasonNumber { get; }
    public string Name { get; }

    /// <summary>"10 episodes".</summary>
    public string EpisodeLine { get; }

    public bool IsRequestable { get; }

    /// <summary>The Episodes column: just the count.</summary>
    public string EpisodeCountText { get; }

    /// <summary>The Status column (0.53, after Seerr's): "Not requested", "Requested", "Available", "Monitored".</summary>
    public string Pill { get; }

    public BadgeTone PillTone { get; }

    partial void OnIsCheckedChanged(bool? value) => changed(this);
}
