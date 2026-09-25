using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;

namespace Marquee.Windows.Converters;

/// <summary>
/// <c>true</c> to Visible, anything else to Collapsed; <see cref="Invert"/>
/// flips it. Registered twice in App.xaml (<c>BoolToVisibility</c> and
/// <c>InvertedBoolToVisibility</c>) so pages never need a converter parameter.
///
/// Partial because CsWinRT asks that classes implementing WinRT interfaces
/// be, so it can generate their projection code.
/// </summary>
public sealed partial class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var visible = value is bool flag && flag;
        if (Invert)
        {
            visible = !visible;
        }
        return visible ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language) =>
        throw new NotSupportedException("Visibility is never bound back to a bool.");
}
