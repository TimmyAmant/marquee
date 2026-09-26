using Marquee.Core.Models;
using Microsoft.UI;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
using Windows.UI.Core;

namespace Marquee.Windows.Controls;

/// <summary>
/// Every sideways rail (Discover's shelves, "Because you watched", the title
/// page's cast, studio and "More like this" rows, Search's and Favorites'
/// studios, the link and filter rows): <c>controls:RailScroll.IsRail="True"</c>
/// on the rail's ScrollViewer. The row then moves only when asked to:
///
/// <list type="bullet">
/// <item>The mouse wheel, Shift+wheel, a tilt wheel and a touchpad's two-finger
/// scroll never move the row. Both of the rail's scroll modes are off, so the
/// ScrollViewer leaves the wheel alone (its OnPointerWheelChanged only acts on
/// an axis whose scroll mode is on) and DirectManipulation gets no wheel or
/// touchpad configuration for it; the input reaches the page's ScrollViewer,
/// which scrolls up and down. Shift+wheel would scroll the page sideways (to
/// nowhere), so over a rail it scrolls the page up and down instead, and a
/// tilt wheel is swallowed.</item>
/// <item>There is no scroll bar to drag: it is Hidden, which (unlike Disabled)
/// keeps the row at its full width so it can still be moved in code.</item>
/// <item>The ‹ › arrows (<see cref="RailArrows"/>) page the row with
/// <c>ChangeView</c>, which the scroll modes don't affect: they only govern
/// what input may scroll, and a programmatic view change goes through
/// DirectManipulation's bring-into-viewport configuration, which a
/// ScrollViewer always has.</item>
/// <item>A touch screen (or pen) swipe left or right pans the row with the
/// finger, glides on after a flick and stops at the ends. Up and down
/// swipes still scroll the page: the rail's manipulation mode includes
/// System, so DirectManipulation keeps vertical pans for the page's
/// ScrollViewer and hands only the sideways ones to the rail. A tap on a
/// poster still opens it; the row only follows a finger that has moved
/// <see cref="RailOffsets.PanThreshold"/> pixels sideways. Mouse drags do
/// nothing.</item>
/// <item>Left and Right, with focus on something in the row, move focus to the
/// neighbouring card; the row follows focus into view.</item>
/// </list>
///
/// The offsets are worked out by <see cref="RailOffsets"/> (Marquee.Core, tested).
/// </summary>
public static class RailScroll
{
    public static readonly DependencyProperty IsRailProperty = DependencyProperty.RegisterAttached(
        "IsRail", typeof(bool), typeof(RailScroll), new PropertyMetadata(false, OnIsRailChanged));

    public static bool GetIsRail(DependencyObject element) => (bool)element.GetValue(IsRailProperty);

    public static void SetIsRail(DependencyObject element, bool value) => element.SetValue(IsRailProperty, value);

    /// <summary>Touch and pen pan the row sideways; everything else stays with the system (the page).</summary>
    private const ManipulationModes TouchModes =
        ManipulationModes.TranslateX | ManipulationModes.TranslateInertia | ManipulationModes.System;

    /// <summary>A flick's glide slows by 10 inches per second², Microsoft's suggested rate for a pan.</summary>
    private const double GlideDeceleration = 10.0 * 96.0 / (1000.0 * 1000.0);

    private static readonly DependencyProperty PanProperty = DependencyProperty.RegisterAttached(
        "Pan", typeof(PanState), typeof(RailScroll), new PropertyMetadata(null));

    // Where the page is heading while Shift+wheel notches keep arriving
    // mid-animation, so quick spins add up instead of each restarting.
    private static readonly DependencyProperty PendingOffsetProperty = DependencyProperty.RegisterAttached(
        "PendingOffset", typeof(double), typeof(RailScroll), new PropertyMetadata(double.NaN));

    private static readonly PointerEventHandler PressedHandler = OnPointerPressed;

    private sealed class PanState
    {
        public double From;
        public bool Following;
    }

    private static void OnIsRailChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not ScrollViewer rail) return;
        Detach(rail);
        if (e.NewValue is true) Attach(rail);
    }

    private static void Attach(ScrollViewer rail)
    {
        rail.HorizontalScrollMode = ScrollMode.Disabled;
        rail.VerticalScrollMode = ScrollMode.Disabled;
        rail.HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden;
        rail.VerticalScrollBarVisibility = ScrollBarVisibility.Disabled;
        rail.ZoomMode = ZoomMode.Disabled;
        // A swipe that starts between two cards has to land on the rail.
        rail.Background ??= new SolidColorBrush(Colors.Transparent);
        rail.ManipulationMode = TouchModes;

        rail.AddHandler(UIElement.PointerPressedEvent, PressedHandler, true);
        rail.ManipulationStarting += OnManipulationStarting;
        rail.ManipulationStarted += OnManipulationStarted;
        rail.ManipulationDelta += OnManipulationDelta;
        rail.ManipulationInertiaStarting += OnManipulationInertiaStarting;
        rail.ManipulationCompleted += OnManipulationCompleted;
        rail.PointerWheelChanged += OnWheel;
        rail.KeyDown += OnKeyDown;
    }

    private static void Detach(ScrollViewer rail)
    {
        rail.RemoveHandler(UIElement.PointerPressedEvent, PressedHandler);
        rail.ManipulationStarting -= OnManipulationStarting;
        rail.ManipulationStarted -= OnManipulationStarted;
        rail.ManipulationDelta -= OnManipulationDelta;
        rail.ManipulationInertiaStarting -= OnManipulationInertiaStarting;
        rail.ManipulationCompleted -= OnManipulationCompleted;
        rail.PointerWheelChanged -= OnWheel;
        rail.KeyDown -= OnKeyDown;
        rail.ClearValue(PanProperty);
    }

    // MARK: Touch

    /// <summary>
    /// Only a finger or a pen may drag the row; a mouse press leaves the
    /// rail to the system, so dragging with the mouse moves nothing and a
    /// click on a card is never taken for a pan. Seen even when a card
    /// has handled the press, and before any manipulation starts.
    /// </summary>
    private static void OnPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (sender is not ScrollViewer rail) return;
        var device = e.Pointer.PointerDeviceType;
        rail.ManipulationMode = device is PointerDeviceType.Touch or PointerDeviceType.Pen
            ? TouchModes
            : ManipulationModes.System;
    }

    private static void OnManipulationStarting(object sender, ManipulationStartingRoutedEventArgs e)
    {
        // Measure the pan against the rail, which stays put, not the row that moves under the finger.
        e.Container = (UIElement)sender;
    }

    private static void OnManipulationStarted(object sender, ManipulationStartedRoutedEventArgs e)
    {
        var rail = (ScrollViewer)sender;
        if (e.PointerDeviceType == PointerDeviceType.Mouse)
        {
            e.Complete();
            return;
        }
        rail.SetValue(PanProperty, new PanState { From = rail.HorizontalOffset });
    }

    private static void OnManipulationDelta(object sender, ManipulationDeltaRoutedEventArgs e)
    {
        var rail = (ScrollViewer)sender;
        if (rail.GetValue(PanProperty) is not PanState pan || e.PointerDeviceType == PointerDeviceType.Mouse) return;

        var moved = e.Cumulative.Translation.X;
        if (!pan.Following && !RailOffsets.IsPan(moved)) return;
        pan.Following = true;
        e.Handled = true;

        var scrollable = rail.ScrollableWidth;
        var target = RailOffsets.PanTarget(pan.From, moved, scrollable);
        rail.ChangeView(target, null, null, true);

        if (e.IsInertial && RailOffsets.HitEnd(target, e.Delta.Translation.X, scrollable))
        {
            e.Complete();
        }
    }

    private static void OnManipulationInertiaStarting(object sender, ManipulationInertiaStartingRoutedEventArgs e)
    {
        e.TranslationBehavior.DesiredDeceleration = GlideDeceleration;
    }

    private static void OnManipulationCompleted(object sender, ManipulationCompletedRoutedEventArgs e)
    {
        var rail = (ScrollViewer)sender;
        if (rail.GetValue(PanProperty) is PanState { Following: true })
        {
            e.Handled = true;
        }
        rail.ClearValue(PanProperty);
    }

    // MARK: Wheel

    /// <summary>
    /// The rail's own ScrollViewer has already passed on the wheel (its
    /// scroll modes are off), so a plain wheel carries on up to the page.
    /// Shift+wheel is turned into an up/down scroll of the page, and a
    /// tilt wheel stops here.
    /// </summary>
    private static void OnWheel(object sender, PointerRoutedEventArgs e)
    {
        if (e.Handled) return;
        var point = e.GetCurrentPoint(null);
        if (point.Properties.IsHorizontalMouseWheel)
        {
            e.Handled = true;
            return;
        }
        var shift = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift);
        if ((shift & CoreVirtualKeyStates.Down) != CoreVirtualKeyStates.Down) return;

        e.Handled = true;
        if (PageScrollViewer((DependencyObject)sender) is not { } page) return;
        var pending = (double)page.GetValue(PendingOffsetProperty);
        var from = double.IsNaN(pending) ? page.VerticalOffset : pending;
        var target = Math.Clamp(from - point.Properties.MouseWheelDelta, 0, page.ScrollableHeight);
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
    private static ScrollViewer? PageScrollViewer(DependencyObject rail)
    {
        var node = VisualTreeHelper.GetParent(rail);
        while (node is not null)
        {
            if (node is ScrollViewer sv && sv.VerticalScrollMode != ScrollMode.Disabled && sv.ScrollableHeight > 0)
                return sv;
            node = VisualTreeHelper.GetParent(node);
        }
        return null;
    }

    // MARK: Keyboard

    /// <summary>Left/Right move focus along the row; the focused card scrolls into view.</summary>
    private static void OnKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Handled || e.Key is not (VirtualKey.Left or VirtualKey.Right)) return;
        if (e.OriginalSource is TextBox or PasswordBox or AutoSuggestBox) return;
        var rail = (ScrollViewer)sender;
        var direction = e.Key == VirtualKey.Left ? FocusNavigationDirection.Left : FocusNavigationDirection.Right;
        var options = new FindNextElementOptions { SearchRoot = rail };
        if (FocusManager.TryMoveFocus(direction, options))
        {
            e.Handled = true;
        }
    }
}
