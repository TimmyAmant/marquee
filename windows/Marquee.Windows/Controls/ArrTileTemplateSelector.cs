using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// Settings › Services' tiles: a server's tile for each server, and the
/// dashed "Add … server" tile (<see cref="ArrAddTile"/>) at the end.
/// </summary>
public sealed partial class ArrTileTemplateSelector : DataTemplateSelector
{
    public DataTemplate? ServerTemplate { get; set; }

    public DataTemplate? AddTemplate { get; set; }

    protected override DataTemplate SelectTemplateCore(object item) => (item is ArrAddTile ? AddTemplate : ServerTemplate)!;

    protected override DataTemplate SelectTemplateCore(object item, DependencyObject container) => SelectTemplateCore(item);
}
