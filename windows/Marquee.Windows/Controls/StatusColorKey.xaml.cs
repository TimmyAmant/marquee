using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The "What do the colors mean?" button beside a poster grid; its flyout
/// lists every library status with its swatch and meaning.
/// </summary>
public sealed partial class StatusColorKey : UserControl
{
    public StatusColorKey()
    {
        InitializeComponent();
    }

    public IReadOnlyList<StatusKeyEntry> Entries => StatusKeyEntry.All;
}
