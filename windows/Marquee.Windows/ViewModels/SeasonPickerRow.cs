using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One row of the season picker: name and episode count, then a checkbox
/// when the season can be requested, else the tag saying why not ("In
/// library", "Monitored", "Requested").
/// </summary>
public sealed partial class SeasonPickerRow : ObservableObject
{
    private readonly Action<SeasonPickerRow> changed;

    /// <summary>The checkbox; two-way bound, and every change is reported to the dialog.</summary>
    [ObservableProperty]
    private bool? isChecked = false;

    public SeasonPickerRow(SeasonSummary season, Action<SeasonPickerRow> changed)
    {
        this.changed = changed;
        SeasonNumber = season.SeasonNumber;
        Name = season.Name;
        EpisodeLine = Format.Count(season.EpisodeCount, "episode", "episodes");
        var state = season.RequestState;
        IsRequestable = state == SeasonRequestState.Requestable;
        Tag = state.Tag();
        TagTone = state == SeasonRequestState.InLibrary ? BadgeTone.Owned : BadgeTone.Tracked;
    }

    public int SeasonNumber { get; }
    public string Name { get; }

    /// <summary>"10 episodes".</summary>
    public string EpisodeLine { get; }

    public bool IsRequestable { get; }

    /// <summary>"In library", "Monitored" or "Requested"; empty for a checkbox row (the pill then hides itself).</summary>
    public string Tag { get; }

    public BadgeTone TagTone { get; }

    partial void OnIsCheckedChanged(bool? value) => changed(this);
}
