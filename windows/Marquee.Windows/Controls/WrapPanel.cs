using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Marquee.Windows.Controls;

/// <summary>
/// Lays its children out left to right and starts a new line when the next
/// one wouldn't fit (the Mac's <c>FlowLayout</c>). Settings' tabs use it so a
/// narrow window wraps them instead of hiding Activity and About off the edge.
/// </summary>
public sealed partial class WrapPanel : Panel
{
    public double HorizontalSpacing { get; set; } = 2;
    public double VerticalSpacing { get; set; } = 6;

    protected override Size MeasureOverride(Size availableSize)
    {
        double x = 0, y = 0, lineHeight = 0, widest = 0;
        foreach (var child in Children)
        {
            child.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > availableSize.Width)
            {
                y += lineHeight + VerticalSpacing;
                x = 0;
                lineHeight = 0;
            }
            x += size.Width + HorizontalSpacing;
            widest = Math.Max(widest, x - HorizontalSpacing);
            lineHeight = Math.Max(lineHeight, size.Height);
        }
        var width = double.IsInfinity(availableSize.Width) ? widest : availableSize.Width;
        return new Size(width, y + lineHeight);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        double x = 0, y = 0, lineHeight = 0;
        foreach (var child in Children)
        {
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > finalSize.Width)
            {
                y += lineHeight + VerticalSpacing;
                x = 0;
                lineHeight = 0;
            }
            child.Arrange(new Rect(x, y, size.Width, size.Height));
            x += size.Width + HorizontalSpacing;
            lineHeight = Math.Max(lineHeight, size.Height);
        }
        return finalSize;
    }
}
