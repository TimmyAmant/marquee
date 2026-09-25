using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// A page for sections and routes that have no page yet. Its navigation
/// parameter is the heading (a section title or a route description); a
/// null or empty parameter shows nothing, which is how the window blanks
/// the content frame on sign-out.
/// </summary>
public sealed partial class PlaceholderPage : Page
{
    public PlaceholderPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var heading = e.Parameter as string;
        HeadingText.Text = heading ?? "";
        Body.Visibility = string.IsNullOrEmpty(heading) ? Visibility.Collapsed : Visibility.Visible;
    }
}
