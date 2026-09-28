using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// A tab made of other tabs' parts, one under the other (Members: the
/// household list from the Account view, then single sign-on from the
/// Integrations view), each activated with the tab.
/// </summary>
public sealed partial class CompositeSettingsView : UserControl, ISettingsTabView
{
    private readonly UIElement[] parts;

    public CompositeSettingsView(params UIElement[] parts)
    {
        this.parts = parts;
        var stack = new StackPanel { Spacing = 28 };
        foreach (var part in parts)
        {
            stack.Children.Add(part);
        }
        Content = stack;
    }

    public void Activate()
    {
        foreach (var part in parts.OfType<ISettingsTabView>())
        {
            part.Activate();
        }
    }

    public void Deactivate()
    {
        foreach (var part in parts.OfType<ISettingsTabView>())
        {
            part.Deactivate();
        }
    }
}
