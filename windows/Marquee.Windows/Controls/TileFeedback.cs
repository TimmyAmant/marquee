using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;

namespace Marquee.Windows.Controls;

/// <summary>
/// Hover and pressed feedback for a picture tile (<see cref="LogoTile"/>,
/// <see cref="GenreTile"/>) whose artwork covers the Button's own
/// pointer-over and pressed fills. The Button marks presses handled, so the
/// pressed handlers listen for handled events too. Keyboard focus is the
/// Button's system focus visual, as on <c>PosterCard</c>.
/// </summary>
internal sealed class TileFeedback
{
    /// <summary>How far a pressed tile fades, so the click reads before the page changes.</summary>
    public const double PressedOpacity = 0.8;

    private readonly Action<bool> hover;
    private readonly Action<bool> press;

    public TileFeedback(Button button, Action<bool> hover, Action<bool> press)
    {
        this.hover = hover;
        this.press = press;
        button.PointerEntered += (_, _) => hover(true);
        button.PointerExited += (_, _) => Reset();
        button.PointerCanceled += (_, _) => Reset();
        button.PointerCaptureLost += (_, _) => press(false);
        button.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler((_, _) => press(true)), handledEventsToo: true);
        button.AddHandler(UIElement.PointerReleasedEvent, new PointerEventHandler((_, _) => press(false)), handledEventsToo: true);
    }

    /// <summary>Back to rest: the pointer left, or the tile now shows another item.</summary>
    public void Reset()
    {
        hover(false);
        press(false);
    }
}
