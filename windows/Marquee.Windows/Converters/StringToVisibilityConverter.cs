using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;

namespace Marquee.Windows.Converters;

/// <summary>
/// Visible for a non-blank string, Collapsed for null, empty or whitespace:
/// the poster card's optional pills and the pages' optional messages.
/// </summary>
public sealed partial class StringToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language) =>
        value is string text && !string.IsNullOrWhiteSpace(text) ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, string language) =>
        throw new NotSupportedException("Visibility is never bound back to a string.");
}
