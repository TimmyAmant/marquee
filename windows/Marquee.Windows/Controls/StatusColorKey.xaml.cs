using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The "Color key" pill beside a poster grid or a page title; its flyout
/// lists every library status with its swatch and meaning
/// (<see cref="StatusColorLegend"/>).
/// </summary>
public sealed partial class StatusColorKey : UserControl
{
    public StatusColorKey()
    {
        InitializeComponent();
    }
}
