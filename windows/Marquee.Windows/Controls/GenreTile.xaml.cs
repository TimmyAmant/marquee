using System.Numerics;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Composition;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Hosting;

namespace Marquee.Windows.Controls;

/// <summary>
/// A genre tile. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:ChipItem"</c>); clicking
/// runs the item's <see cref="ChipItem.Open"/> command.
/// </summary>
public sealed partial class GenreTile : UserControl
{
    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(ChipItem),
        typeof(GenreTile),
        new PropertyMetadata(null, OnItemChanged));

    /// <summary>The backdrop's opacity at rest and under the pointer (opacity-45, group-hover:opacity-60).</summary>
    private const double BackdropOpacity = 0.45;
    private const double BackdropHoverOpacity = 0.6;

    private readonly TileFeedback feedback;
    private SpriteVisual? shadowVisual;

    public GenreTile()
    {
        InitializeComponent();
        feedback = new TileFeedback(TileButton, hovering =>
        {
            Backdrop.Opacity = hovering ? BackdropHoverOpacity : BackdropOpacity;
        }, pressed =>
        {
            Tile.Opacity = pressed ? TileFeedback.PressedOpacity : 1;
        });
        NameText.SizeChanged += (_, _) => SizeShadow();
        Loaded += (_, _) => AttachShadow();
    }

    public ChipItem? Item
    {
        get => (ChipItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }

    // An ItemsRepeater recycles the tile for another item: drop the old hover.
    private static void OnItemChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((GenreTile)sender).feedback?.Reset();

    /// <summary>
    /// text-shadow: 0 2px 14px rgba(0,0,0,.35), as a drop shadow masked by
    /// the name's own glyphs. The mask follows the text as it changes.
    /// </summary>
    private void AttachShadow()
    {
        if (shadowVisual != null)
        {
            return;
        }
        var compositor = ElementCompositionPreview.GetElementVisual(ShadowHost).Compositor;
        var shadow = compositor.CreateDropShadow();
        shadow.Mask = NameText.GetAlphaMask();
        shadow.BlurRadius = 14;
        shadow.Offset = new Vector3(0, 2, 0);
        shadow.Color = global::Windows.UI.Color.FromArgb(0x59, 0, 0, 0);

        shadowVisual = compositor.CreateSpriteVisual();
        shadowVisual.Shadow = shadow;
        ElementCompositionPreview.SetElementChildVisual(ShadowHost, shadowVisual);
        SizeShadow();
    }

    private void SizeShadow()
    {
        if (shadowVisual != null)
        {
            shadowVisual.Size = new Vector2((float)NameText.ActualWidth, (float)NameText.ActualHeight);
        }
    }
}
