using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The ‹ › pair for a sideways rail. Set <see cref="Target"/> to the rail's
/// horizontal ScrollViewer (<c>Target="{x:Bind CastRail}"</c> on a page,
/// <c>Target="{Binding ElementName=Rail}"</c> inside a DataTemplate). A
/// click pages by most of the visible width with the ScrollViewer's own
/// animation, as shelf.tsx scrolls by 0.8 × clientWidth.
///
/// The buttons follow the rail: scrolling (<c>ViewChanged</c>), the window
/// resizing (the rail's <c>SizeChanged</c>), and the row itself growing or
/// shrinking as its items arrive (the content's <c>SizeChanged</c>, and the
/// rail's <c>ScrollableWidth</c> changing). The rail always sits next to
/// its arrows (the same page or item template), so the two go away
/// together and nothing needs unhooking but a changed Target.
/// </summary>
public sealed partial class RailArrows : UserControl
{
    /// <summary>How much of the visible width one click moves.</summary>
    public const double PageFraction = 0.85;

    /// <summary>Offsets within this of an end count as at it (shelf.tsx's 1px).</summary>
    private const double EdgeTolerance = 1;

    public static readonly DependencyProperty TargetProperty = DependencyProperty.Register(
        nameof(Target),
        typeof(ScrollViewer),
        typeof(RailArrows),
        new PropertyMetadata(null, OnTargetChanged));

    private ScrollViewer? rail;
    private FrameworkElement? railContent;
    private long scrollableWidthToken;

    /// <summary>Where a click is heading while the rail is still animating, so quick clicks add up.</summary>
    private double? pendingOffset;

    public RailArrows()
    {
        InitializeComponent();
        // Loaded looks again: the rail's content may only be there by now.
        Loaded += (_, _) => Attach(Target);
    }

    public ScrollViewer? Target
    {
        get => (ScrollViewer?)GetValue(TargetProperty);
        set => SetValue(TargetProperty, value);
    }

    private static void OnTargetChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((RailArrows)d).Attach(e.NewValue as ScrollViewer);

    // MARK: Following the rail

    private void Attach(ScrollViewer? next)
    {
        if (!ReferenceEquals(next, rail) || (next != null && !ReferenceEquals(next.Content, railContent)))
        {
            Detach();
            rail = next;
            if (next != null)
            {
                next.ViewChanged += OnRailViewChanged;
                next.SizeChanged += OnRailSizeChanged;
                scrollableWidthToken = next.RegisterPropertyChangedCallback(ScrollViewer.ScrollableWidthProperty, OnScrollableWidthChanged);
                if (next.Content is FrameworkElement content)
                {
                    railContent = content;
                    content.SizeChanged += OnRailSizeChanged;
                }
            }
        }
        Update();
    }

    private void Detach()
    {
        if (rail != null)
        {
            rail.ViewChanged -= OnRailViewChanged;
            rail.SizeChanged -= OnRailSizeChanged;
            rail.UnregisterPropertyChangedCallback(ScrollViewer.ScrollableWidthProperty, scrollableWidthToken);
        }
        if (railContent != null)
        {
            railContent.SizeChanged -= OnRailSizeChanged;
        }
        rail = null;
        railContent = null;
        pendingOffset = null;
    }

    private void OnRailViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (!e.IsIntermediate)
        {
            pendingOffset = null;
        }
        Update();
    }

    private void OnRailSizeChanged(object sender, SizeChangedEventArgs e)
    {
        Update();
        // The rail's extent settles in the same layout pass; look again once it has.
        DispatcherQueue.TryEnqueue(Update);
    }

    private void OnScrollableWidthChanged(DependencyObject sender, DependencyProperty property) => Update();

    /// <summary>Both arrows go when the row fits; otherwise ‹ fades at the start and › at the end.</summary>
    private void Update()
    {
        if (rail is not { } current || current.ScrollableWidth <= EdgeTolerance)
        {
            Arrows.Visibility = Visibility.Collapsed;
            return;
        }
        Arrows.Visibility = Visibility.Visible;
        var offset = current.HorizontalOffset;
        PreviousButton.IsEnabled = offset > EdgeTolerance;
        NextButton.IsEnabled = offset < current.ScrollableWidth - EdgeTolerance;
    }

    // MARK: Paging

    private void OnPreviousClick(object sender, RoutedEventArgs e) => Page(-1);

    private void OnNextClick(object sender, RoutedEventArgs e) => Page(1);

    private void Page(int direction)
    {
        if (rail is not { } current)
        {
            return;
        }
        var from = pendingOffset ?? current.HorizontalOffset;
        var target = Math.Clamp(from + direction * current.ViewportWidth * PageFraction, 0, current.ScrollableWidth);
        pendingOffset = target;
        current.ChangeView(target, null, null, false);
    }
}
