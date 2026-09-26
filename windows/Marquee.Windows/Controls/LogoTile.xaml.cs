using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A studio or network logo tile. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:ChipItem"</c>); clicking
/// runs the item's <see cref="ChipItem.Open"/> command.
/// </summary>
public sealed partial class LogoTile : UserControl
{
    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(ChipItem),
        typeof(LogoTile),
        new PropertyMetadata(null, OnItemChanged));

    private readonly TileFeedback feedback;

    public LogoTile()
    {
        InitializeComponent();
        feedback = new TileFeedback(TileButton, hovering =>
        {
            HoverOutline.Opacity = hovering ? 1 : 0;
        }, pressed =>
        {
            Tile.Opacity = pressed ? TileFeedback.PressedOpacity : 1;
        });
    }

    public ChipItem? Item
    {
        get => (ChipItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }

    // An ItemsRepeater recycles the tile for another item: drop the old hover.
    private static void OnItemChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((LogoTile)sender).feedback?.Reset();
}
