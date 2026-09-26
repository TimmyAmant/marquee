using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A studio chip. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:ChipItem"</c>); clicking
/// runs the item's <see cref="ChipItem.Open"/> command.
/// </summary>
public sealed partial class StudioChip : UserControl
{
    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(ChipItem),
        typeof(StudioChip),
        new PropertyMetadata(null));

    public StudioChip()
    {
        InitializeComponent();
    }

    public ChipItem? Item
    {
        get => (ChipItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }
}
