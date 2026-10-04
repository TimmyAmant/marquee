using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.Controls;

/// <summary>
/// components/collection-prompt.tsx: "Part of The Matrix Collection" — the
/// other movies of a just-added or just-requested movie's collection, with
/// Not now and Add all / Request all. Once they've gone through, the
/// server's line ("Requested all 3.") replaces the list and OK closes it.
/// The caller sets <c>XamlRoot</c>, as every ContentDialog needs.
/// </summary>
internal static class CollectionOfferDialog
{
    /// <param name="accept">"Add all" / "Request all": the server's result, or throws its <see cref="ApiException"/>.</param>
    public static ContentDialog Create(CollectionRest rest, Func<Task<CollectionRestResult>> accept)
    {
        var count = rest.Items.Count;
        var body = new TextBlock
        {
            Text = rest.IsAdd ? Loc.Plural("CollectionOffer_BodyAdd", count) : Loc.Plural("CollectionOffer_BodyRequest", count),
            TextWrapping = TextWrapping.Wrap,
            Foreground = SecondaryText,
        };
        var list = new StackPanel { Spacing = 8 };
        foreach (var item in rest.Items)
        {
            list.Children.Add(Row(item));
        }
        var error = new TextBlock
        {
            TextWrapping = TextWrapping.Wrap,
            Foreground = (Brush)Application.Current.Resources["SystemFillColorCriticalBrush"],
            Visibility = Visibility.Collapsed,
        };
        var content = new StackPanel { Spacing = 12, MinWidth = 380, MaxWidth = 480 };
        content.Children.Add(body);
        content.Children.Add(new ScrollViewer { Content = list, MaxHeight = 320, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        content.Children.Add(error);

        var dialog = new ContentDialog
        {
            Title = Loc.Format("CollectionOffer_Title", rest.Collection?.Name ?? ""),
            Content = content,
            PrimaryButtonText = AcceptLabel(rest.IsAdd, count),
            CloseButtonText = Loc.Get("CollectionOffer_NotNow"),
            DefaultButton = ContentDialogButton.Primary,
        };
        var done = false;
        dialog.PrimaryButtonClick += async (sender, args) =>
        {
            if (done)
            {
                return;
            }
            // Stays open: it shows how it went (or what went wrong) first.
            args.Cancel = true;
            var deferral = args.GetDeferral();
            sender.IsPrimaryButtonEnabled = false;
            sender.PrimaryButtonText = rest.IsAdd ? Loc.Get("Title_Adding") : Loc.Get("Title_Requesting");
            error.Visibility = Visibility.Collapsed;
            try
            {
                var result = await accept();
                done = true;
                body.Text = result.Message;
                list.Visibility = Visibility.Collapsed;
                sender.PrimaryButtonText = "";
                sender.CloseButtonText = Loc.Get("Title_Ok");
            }
            catch (ApiException failure)
            {
                error.Text = failure.Message;
                error.Visibility = Visibility.Visible;
                sender.PrimaryButtonText = AcceptLabel(rest.IsAdd, count);
                sender.IsPrimaryButtonEnabled = true;
            }
            finally
            {
                deferral.Complete();
            }
        };
        return dialog;
    }

    private static string AcceptLabel(bool add, int count) =>
        add ? Loc.Plural("CollectionOffer_AddAll", count) : Loc.Plural("CollectionOffer_RequestAll", count);

    private static Brush SecondaryText => (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"];

    private static Grid Row(TitleCard item)
    {
        var row = new Grid { ColumnSpacing = 12 };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var poster = new Border
        {
            Width = 36,
            Height = 54,
            CornerRadius = new CornerRadius(4),
            Background = (Brush)Application.Current.Resources["CardBackgroundFillColorSecondaryBrush"],
        };
        if (item.PosterPath?.Url(ImageSize.W92) is { } url)
        {
            poster.Child = new Image { Source = new BitmapImage(url), Stretch = Stretch.UniformToFill };
        }
        row.Children.Add(poster);
        var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(new TextBlock { Text = item.Name, TextTrimming = TextTrimming.CharacterEllipsis });
        if (item.Year is { } year)
        {
            text.Children.Add(new TextBlock
            {
                Text = year,
                Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"],
                Foreground = SecondaryText,
            });
        }
        Grid.SetColumn(text, 1);
        row.Children.Add(text);
        return row;
    }
}
