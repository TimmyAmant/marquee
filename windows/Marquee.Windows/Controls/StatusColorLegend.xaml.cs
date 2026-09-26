using Marquee.Core.Models;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// Every library status with its swatch, name and meaning, and the
/// "Same colors as Radarr and Sonarr." footnote: the color key's flyout and
/// Settings › About's "What the colors mean".
/// </summary>
public sealed partial class StatusColorLegend : UserControl
{
    public StatusColorLegend()
    {
        InitializeComponent();
    }

    public IReadOnlyList<StatusKeyEntry> Entries => StatusKeyEntry.All;

    public string Footnote => LibraryStatus.ColorKeyFootnote;
}
