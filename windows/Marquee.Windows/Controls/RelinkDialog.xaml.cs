using System.Globalization;
using Marquee.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The "Fix ID" form. After <c>ShowAsync</c> returns <c>Primary</c>,
/// <see cref="Target"/> is the id to send to <c>POST …/relink</c>. The
/// caller sets <c>XamlRoot</c> before showing it.
/// </summary>
public sealed partial class RelinkDialog : ContentDialog
{
    private readonly bool isTv;

    public RelinkDialog(MediaType mediaType)
    {
        isTv = mediaType == MediaType.Tv;
        InitializeComponent();
        TvdbBox.Visibility = isTv ? Visibility.Visible : Visibility.Collapsed;
    }

    /// <summary>The server checks tmdbId, then imdbId, then tvdbId (TV only); null while nothing usable is typed.</summary>
    public RelinkTarget? Target
    {
        get
        {
            if (int.TryParse(TmdbBox.Text.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var tmdbId) && tmdbId > 0)
            {
                return RelinkTarget.Tmdb(tmdbId);
            }
            var imdb = ImdbBox.Text.Trim();
            if (imdb.Length > 0)
            {
                return RelinkTarget.Imdb(imdb);
            }
            if (isTv && int.TryParse(TvdbBox.Text.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var tvdbId) && tvdbId > 0)
            {
                return RelinkTarget.Tvdb(tvdbId);
            }
            return null;
        }
    }

    private void OnTextChanged(object sender, TextChangedEventArgs e) => IsPrimaryButtonEnabled = Target != null;
}
