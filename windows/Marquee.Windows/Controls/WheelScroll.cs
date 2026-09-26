using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
using Windows.UI.Core;

namespace Marquee.Windows.Controls;

/// <summary>
/// For the sideways rails (Discover's shelves, "Because you watched", the
/// title page's cast): a horizontal-only ScrollViewer turns the mouse wheel
/// into sideways scrolling, so with the pointer over a rail the page stops
/// scrolling down. <c>controls:WheelScroll.PassToPage="True"</c> sends the
/// ordinary wheel to the page's own ScrollViewer instead; Shift+wheel and a
/// tilt wheel still scroll the rail, as do its scroll bar and touch.
/// </summary>
public static class WheelScroll
{
    public static readonly DependencyProperty PassToPageProperty = DependencyProperty.RegisterAttached(
        "PassToPage", typeof(bool), typeof(WheelScroll), new PropertyMetadata(false, OnPassToPageChanged));

    public static bool GetPassToPage(DependencyObject element) => (bool)element.GetValue(PassToPageProperty);

    public static void SetPassToPage(DependencyObject element, bool value) => element.SetValue(PassToPageProperty, value);

    // Where the page is heading while wheel notches keep arriving mid-animation,
    // so quick spins add up instead of each restarting from the current offset.
    private static readonly DependencyProperty PendingOffsetProperty = DependencyProperty.RegisterAttached(
        "PendingOffset", typeof(double), typeof(WheelScroll), new PropertyMetadata(double.NaN));

    private static void OnPassToPageChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not ScrollViewer rail) return;
        // The rail's content sees the wheel before the rail does (it bubbles
        // up from the poster under the pointer), so handling it there keeps
        // the rail from scrolling sideways.
        rail.Loaded -= OnRailLoaded;
        if ((bool)e.NewValue)
        {
            rail.Loaded += OnRailLoaded;
            if (rail.IsLoaded) Attach(rail);
        }
        else if (rail.Content is UIElement content)
        {
            content.PointerWheelChanged -= OnContentWheel;
        }
    }

    private static void OnRailLoaded(object sender, RoutedEventArgs e) => Attach((ScrollViewer)sender);

    private static void Attach(ScrollViewer rail)
    {
        if (rail.Content is not UIElement content) return;
        content.PointerWheelChanged -= OnContentWheel;
        content.PointerWheelChanged += OnContentWheel;
    }

    private static void OnContentWheel(object sender, PointerRoutedEventArgs e)
    {
        var point = e.GetCurrentPoint(null);
        if (point.Properties.IsHorizontalMouseWheel) return;
        var shift = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift);
        if ((shift & CoreVirtualKeyStates.Down) == CoreVirtualKeyStates.Down) return;

        var page = PageScrollViewer((DependencyObject)sender);
        if (page is null) return;
        e.Handled = true;

        var delta = point.Properties.MouseWheelDelta;
        var pending = (double)page.GetValue(PendingOffsetProperty);
        var from = double.IsNaN(pending) ? page.VerticalOffset : pending;
        var target = Math.Clamp(from - delta, 0, page.ScrollableHeight);
        page.SetValue(PendingOffsetProperty, target);
        page.ViewChanged -= OnPageViewChanged;
        page.ViewChanged += OnPageViewChanged;
        page.ChangeView(null, target, null);
    }

    private static void OnPageViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (e.IsIntermediate || sender is not ScrollViewer page) return;
        page.ViewChanged -= OnPageViewChanged;
        page.ClearValue(PendingOffsetProperty);
    }

    /// <summary>The nearest ScrollViewer above the rail that scrolls up and down.</summary>
    private static ScrollViewer? PageScrollViewer(DependencyObject from)
    {
        var node = VisualTreeHelper.GetParent(from);
        // Step past the rail itself first.
        while (node is not null and not ScrollViewer) node = VisualTreeHelper.GetParent(node);
        node = node is null ? null : VisualTreeHelper.GetParent(node);
        while (node is not null)
        {
            if (node is ScrollViewer sv && sv.VerticalScrollMode != ScrollMode.Disabled && sv.ScrollableHeight > 0)
                return sv;
            node = VisualTreeHelper.GetParent(node);
        }
        return null;
    }
}
