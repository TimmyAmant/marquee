using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using static Marquee.Windows.Views.Settings.AdminToolsUi;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Jobs, under the jobs: the Can't Find Check's wait, "Flag a
/// request after [24] hours without a find" (0.46+; the Mac's
/// NotFoundHoursSetting, components/not-found-hours-setting.tsx). Hidden when
/// the server doesn't have the setting.
/// </summary>
public sealed partial class NotFoundHoursView : UserControl, ISettingsTabView
{
    private readonly NumberBox hours = new()
    {
        Minimum = NotFoundSettings.MinAfterHours,
        Maximum = NotFoundSettings.MaxAfterHours,
        SmallChange = 1,
        LargeChange = 24,
        SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact,
        MinWidth = 96,
        VerticalAlignment = VerticalAlignment.Center,
    };
    private readonly Button save = new() { Style = Resource<Style>("AccentButtonStyle"), Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBlock status = new() { VerticalAlignment = VerticalAlignment.Center, Style = Resource<Style>("CaptionTextBlockStyle") };
    private readonly TextBlock error = ErrorText();

    /// <summary>What the server has; null until loaded.</summary>
    private int? saved;
    private bool busy;

    public NotFoundHoursView()
    {
        Visibility = Visibility.Collapsed;
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(hours, Loc.Get("Jobs_NotFoundHours"));
        save.Content = Loc.Get("Jobs_NotFoundSave");
        save.Click += async (_, _) => await SaveAsync();
        hours.ValueChanged += (_, _) => Refresh();

        var sentence = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        sentence.Children.Add(Text(Loc.Get("Jobs_NotFoundBefore")));
        sentence.Children.Add(hours);
        sentence.Children.Add(Text(Loc.Get("Jobs_NotFoundAfter")));
        sentence.Children.Add(save);
        sentence.Children.Add(status);
        var row = new StackPanel { Padding = new Thickness(20, 12, 20, 12), Spacing = 8 };
        row.Children.Add(sentence);
        row.Children.Add(error);

        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Heading(Loc.Get("Jobs_NotFoundHeading"), null, subtitle: false));
        stack.Children.Add(Card(row));
        Content = stack;
    }

    private static TextBlock Text(string text) => new()
    {
        Text = text,
        VerticalAlignment = VerticalAlignment.Center,
        Style = Resource<Style>("BodyTextBlockStyle"),
    };

    public void Activate() => _ = LoadAsync();

    public void Deactivate()
    {
    }

    private async Task LoadAsync()
    {
        try
        {
            // An older server (404) answers null: no row.
            if (await AppServices.Model.Api.Jobs.NotFoundSettingsAsync() is not { } settings)
            {
                Visibility = Visibility.Collapsed;
                return;
            }
            saved = settings.AfterHours;
            hours.Value = settings.AfterHours;
            status.Text = "";
            Visibility = Visibility.Visible;
            Refresh();
        }
        catch (ApiException)
        {
            // A failure leaves the row as it was.
        }
    }

    /// <summary>The whole number of hours in the box, within 1 to 720; null while it's empty.</summary>
    private int? Value => double.IsNaN(hours.Value)
        ? null
        : (int)Math.Clamp(Math.Round(hours.Value), NotFoundSettings.MinAfterHours, NotFoundSettings.MaxAfterHours);

    private void Refresh()
    {
        var changed = Value is { } value && value != saved;
        save.Visibility = changed ? Visibility.Visible : Visibility.Collapsed;
        save.IsEnabled = !busy;
        save.Content = busy ? Loc.Get("Jobs_NotFoundSaving") : Loc.Get("Jobs_NotFoundSave");
        if (changed)
        {
            status.Text = "";
        }
    }

    private async Task SaveAsync()
    {
        if (busy || Value is not { } value)
        {
            return;
        }
        busy = true;
        Show(error, null);
        Refresh();
        try
        {
            var result = await AppServices.Model.Api.Jobs.SaveNotFoundSettingsAsync(value);
            saved = result.AfterHours;
            hours.Value = result.AfterHours;
            status.Text = Loc.Get("Jobs_NotFoundSaved");
            status.Foreground = Resource<Brush>("SystemFillColorSuccessBrush");
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation)
            {
                Show(error, failure.Message);
            }
        }
        finally
        {
            busy = false;
            Refresh();
        }
    }
}
