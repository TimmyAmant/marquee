using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A poster tile. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:PosterItem"</c>) and the
/// card draws itself; clicking runs the item's <see cref="PosterItem.Open"/>
/// command with the item as its parameter.
/// </summary>
public sealed partial class PosterCard : UserControl
{
    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(PosterItem),
        typeof(PosterCard),
        new PropertyMetadata(null));

    public PosterCard()
    {
        InitializeComponent();
    }

    public PosterItem? Item
    {
        get => (PosterItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }
}
