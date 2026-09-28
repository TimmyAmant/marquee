using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The error reference (app/help/errors/page.tsx, the Mac's
/// ErrorReferenceView): what every error message means and what to do about
/// it, from <c>GET /help/errors</c> so it always matches the server's own
/// wording. Opened from Settings › About.
/// </summary>
public sealed partial class ErrorReferencePage : Page
{
    private readonly StackPanel categories = new() { Spacing = 28 };
    private readonly ProgressRing progress = new() { Width = 20, Height = 20, HorizontalAlignment = HorizontalAlignment.Left };
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
    private CancellationTokenSource? loading;

    public ErrorReferencePage()
    {
        var body = new StackPanel
        {
            Padding = new Thickness(28, 20, 28, 40),
            Spacing = 24,
            MaxWidth = 860,
            HorizontalAlignment = HorizontalAlignment.Left,
        };
        body.Children.Add(new TextBlock { Text = Loc.Get("Errors_Title"), Style = Resource<Style>("TitleTextBlockStyle"), TextWrapping = TextWrapping.Wrap });
        body.Children.Add(new TextBlock
        {
            Text = Loc.Get("Errors_Intro"),
            Style = Resource<Style>("BodyTextBlockStyle"),
            Foreground = Resource<Brush>("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap,
        });
        body.Children.Add(progress);
        body.Children.Add(status);
        body.Children.Add(categories);
        Content = new ScrollViewer { Content = body };
    }

    private static T Resource<T>(string key) => (T)Application.Current.Resources[key];

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        _ = LoadAsync();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        loading?.Cancel();
    }

    private async Task LoadAsync()
    {
        loading?.Cancel();
        var cts = new CancellationTokenSource();
        loading = cts;
        progress.IsActive = true;
        progress.Visibility = Visibility.Visible;
        ShowStatus(null, isError: false);
        try
        {
            var result = await AppServices.Model.Api.Help.ErrorsAsync(cts.Token);
            if (cts.IsCancellationRequested)
            {
                return;
            }
            Show(result);
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cts.IsCancellationRequested && categories.Children.Count == 0)
            {
                ShowStatus(error.Message, isError: true);
            }
        }
        finally
        {
            if (loading == cts)
            {
                progress.IsActive = false;
                progress.Visibility = Visibility.Collapsed;
            }
        }
    }

    private void ShowStatus(string? text, bool isError)
    {
        status.Text = text ?? "";
        status.Style = Resource<Style>(isError ? "CaptionTextBlockStyle" : "BodyTextBlockStyle");
        status.Foreground = Resource<Brush>(isError ? "SystemFillColorCriticalBrush" : "TextFillColorTertiaryBrush");
        status.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
    }

    private void Show(IReadOnlyList<ErrorReferenceCategory> result)
    {
        categories.Children.Clear();
        if (result.Count == 0)
        {
            ShowStatus(Loc.Get("Errors_Empty"), isError: false);
            return;
        }
        foreach (var category in result)
        {
            var section = new StackPanel { Spacing = 12 };
            section.Children.Add(new TextBlock { Text = category.Title, Style = Resource<Style>("SubtitleTextBlockStyle"), TextWrapping = TextWrapping.Wrap });
            foreach (var entry in category.Entries)
            {
                section.Children.Add(Card(entry));
            }
            categories.Children.Add(section);
        }
    }

    private static Border Card(ErrorReferenceCategory.Entry entry)
    {
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(new TextBlock
        {
            Text = $"“{entry.Message}”",
            FontFamily = new FontFamily("Consolas"),
            FontSize = 13,
            Foreground = Resource<Brush>("SystemFillColorCriticalBrush"),
            TextWrapping = TextWrapping.Wrap,
            IsTextSelectionEnabled = true,
        });
        stack.Children.Add(new TextBlock { Text = entry.Meaning, Style = Resource<Style>("BodyTextBlockStyle"), TextWrapping = TextWrapping.Wrap });
        var whatToDo = new TextBlock { Style = Resource<Style>("BodyTextBlockStyle"), TextWrapping = TextWrapping.Wrap };
        whatToDo.Inlines.Add(new Microsoft.UI.Xaml.Documents.Run
        {
            Text = Loc.Get("Errors_WhatToDo"),
            Foreground = Resource<Brush>("TextFillColorTertiaryBrush"),
            FontWeight = FontWeights.SemiBold,
        });
        whatToDo.Inlines.Add(new Microsoft.UI.Xaml.Documents.Run { Text = " " + entry.WhatToDo, Foreground = Resource<Brush>("TextFillColorSecondaryBrush") });
        stack.Children.Add(whatToDo);
        return new Border { Style = Resource<Style>("SettingsCard"), Child = stack };
    }
}
