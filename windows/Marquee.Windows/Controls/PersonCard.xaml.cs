using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A person tile. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:PersonItem"</c>); clicking
/// the card runs the item's <see cref="PersonItem.Open"/> and the star runs
/// its favorite toggle.
/// </summary>
public sealed partial class PersonCard : UserControl
{
    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(PersonItem),
        typeof(PersonCard),
        new PropertyMetadata(null));

    public PersonCard()
    {
        InitializeComponent();
    }

    public PersonItem? Item
    {
        get => (PersonItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }
}
