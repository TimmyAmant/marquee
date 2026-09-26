using System.ComponentModel;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Controls;

/// <summary>
/// A poster tile. Set <see cref="Item"/> (in a DataTemplate,
/// <c>Item="{x:Bind}"</c> with <c>x:DataType="vm:PosterItem"</c>) and the
/// card draws itself; clicking runs the item's <see cref="PosterItem.Open"/>
/// command with the item as its parameter, and the quick action at the foot
/// of the artwork runs the item's add or request.
/// </summary>
public sealed partial class PosterCard : UserControl
{
    /// <summary>The rail width, and the narrowest a grid column gets.</summary>
    public const double StandardWidth = 150;

    /// <summary>Artwork height over width: TMDb posters are 2:3.</summary>
    private const double PosterAspect = 1.5;

    public static readonly DependencyProperty ItemProperty = DependencyProperty.Register(
        nameof(Item),
        typeof(PosterItem),
        typeof(PosterCard),
        new PropertyMetadata(null, OnItemChanged));

    public static readonly DependencyProperty FillsColumnProperty = DependencyProperty.Register(
        nameof(FillsColumn),
        typeof(bool),
        typeof(PosterCard),
        new PropertyMetadata(false, OnFillsColumnChanged));

    /// <summary>
    /// No mouse at all (a touch-only tablet): nothing can hover, so the quick
    /// action always shows, like the website outside <c>@media(hover:hover)</c>.
    /// </summary>
    private static readonly Lazy<bool> CannotHover = new(() =>
    {
        try
        {
            return new global::Windows.Devices.Input.MouseCapabilities().MousePresent == 0;
        }
        catch (Exception)
        {
            return false;
        }
    });

    private PosterItem? observed;
    private bool pointerInside;
    private bool focusInside;

    public PosterCard()
    {
        InitializeComponent();
        SizeChanged += OnSizeChanged;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    public PosterItem? Item
    {
        get => (PosterItem?)GetValue(ItemProperty);
        set => SetValue(ItemProperty, value);
    }

    /// <summary>
    /// In a <c>UniformGridLayout</c> with <c>ItemsStretch="Uniform"</c>: the
    /// card takes its column's width (at least <see cref="StandardWidth"/>)
    /// and the artwork keeps 2:3, so the grid's columns reach its right edge.
    /// Off (the default) in rails, where every card is 150 wide.
    /// </summary>
    public bool FillsColumn
    {
        get => (bool)GetValue(FillsColumnProperty);
        set => SetValue(FillsColumnProperty, value);
    }

    private static void OnItemChanged(DependencyObject sender, DependencyPropertyChangedEventArgs e)
    {
        var card = (PosterCard)sender;
        // An ItemsRepeater recycles cards: follow the new item only, and
        // start it hidden rather than with the last item's hover.
        card.Observe(card.IsLoaded ? e.NewValue as PosterItem : null);
        card.pointerInside = false;
        card.UpdateQuickAction();
    }

    /// <summary>Only while on screen, so an item outliving its card doesn't keep the card alive.</summary>
    private void Observe(PosterItem? item)
    {
        if (ReferenceEquals(observed, item))
        {
            return;
        }
        if (observed != null)
        {
            observed.PropertyChanged -= OnItemPropertyChanged;
        }
        observed = item;
        if (observed != null)
        {
            observed.PropertyChanged += OnItemPropertyChanged;
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        Observe(Item);
        UpdateQuickAction();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        Observe(null);
        pointerInside = false;
        focusInside = false;
    }

    private static void OnFillsColumnChanged(DependencyObject sender, DependencyPropertyChangedEventArgs e)
    {
        var card = (PosterCard)sender;
        if ((bool)e.NewValue)
        {
            card.Width = double.NaN;
            card.MinWidth = StandardWidth;
        }
        else
        {
            card.Width = StandardWidth;
            card.MinWidth = 0;
            card.SetArtworkHeight(StandardWidth * PosterAspect);
        }
    }

    /// <summary>
    /// A grid measures its first card at the minimum column width to size
    /// every cell, then scales the cell up to fill the row. Report the height
    /// the card has at the width it's asked about (2:3 artwork), not the
    /// height its artwork has at the width it was last arranged at, or each
    /// row would gain the difference as a gap. Nothing is set here, so a
    /// measure never invalidates layout.
    /// </summary>
    protected override global::Windows.Foundation.Size MeasureOverride(global::Windows.Foundation.Size availableSize)
    {
        var desired = base.MeasureOverride(availableSize);
        if (!FillsColumn || !double.IsFinite(availableSize.Width) || double.IsNaN(Artwork.Height))
        {
            return desired;
        }
        var artwork = ArtworkHeightFor(Math.Max(availableSize.Width, StandardWidth));
        var height = Math.Max(0, desired.Height - Artwork.Height + artwork);
        return new global::Windows.Foundation.Size(desired.Width, height);
    }

    /// <summary>The artwork follows the width the card was actually given.</summary>
    private void OnSizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (FillsColumn && e.NewSize.Width > 0)
        {
            SetArtworkHeight(ArtworkHeightFor(e.NewSize.Width));
        }
    }

    private static double ArtworkHeightFor(double width) => Math.Round(width * PosterAspect);

    private void SetArtworkHeight(double height)
    {
        if (Artwork.Height != height)
        {
            Artwork.Height = height;
            QuickActionLayer.Height = height;
        }
    }

    // MARK: When the quick action shows

    private void OnItemPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(PosterItem.QuickAction) or nameof(PosterItem.IsQuickActionBusy) or nameof(PosterItem.QuickActionError))
        {
            UpdateQuickAction();
        }
    }

    private void OnPointerEntered(object sender, PointerRoutedEventArgs e)
    {
        pointerInside = true;
        UpdateQuickAction();
    }

    /// <summary>
    /// Also raised when the pointer moves from the card button onto the
    /// quick action (they're siblings), so only leaving the whole card counts.
    /// </summary>
    private void OnPointerExited(object sender, PointerRoutedEventArgs e)
    {
        var point = e.GetCurrentPoint(this).Position;
        pointerInside = point.X >= 0 && point.Y >= 0 && point.X < ActualWidth && point.Y < ActualHeight;
        UpdateQuickAction();
    }

    private void OnGotFocus(object sender, RoutedEventArgs e)
    {
        focusInside = true;
        UpdateQuickAction();
    }

    /// <summary>Tab from the card to its own quick action keeps it showing.</summary>
    private void OnLostFocus(object sender, RoutedEventArgs e)
    {
        focusInside = XamlRoot != null && IsWithin(FocusManager.GetFocusedElement(XamlRoot) as DependencyObject, this);
        UpdateQuickAction();
    }

    private static bool IsWithin(DependencyObject? element, DependencyObject ancestor)
    {
        for (var current = element; current != null; current = VisualTreeHelper.GetParent(current))
        {
            if (ReferenceEquals(current, ancestor))
            {
                return true;
            }
        }
        return false;
    }

    private void UpdateQuickAction()
    {
        var item = Item;
        var shows = item is { HasQuickAction: true } || item is { HasQuickActionError: true };
        var wanted = item != null
            && shows
            && (pointerInside || focusInside || CannotHover.Value || item.IsQuickActionBusy || item.HasQuickActionError);
        if (!wanted && QuickActionLayer.Visibility == Visibility.Visible && focusInside && XamlRoot != null
            && IsWithin(FocusManager.GetFocusedElement(XamlRoot) as DependencyObject, QuickActionLayer))
        {
            // The add just finished under the keyboard: keep focus on the
            // card instead of losing it with the collapsing button.
            CardButton.Focus(FocusState.Programmatic);
        }
        QuickActionLayer.Visibility = wanted ? Visibility.Visible : Visibility.Collapsed;
    }
}
