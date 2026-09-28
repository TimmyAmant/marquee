using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Storage.Pickers;
using static Marquee.Windows.Views.Settings.AdminToolsUi;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Logs (components/log-viewer.tsx, the Mac's LogsSettingsView;
/// admin, 0.58+): the server's recent lines, secrets masked, filtered by
/// level and text, refreshed every few seconds unless paused, and copied or
/// saved as text. An older server answers 404, and the tab says so.
/// </summary>
public sealed partial class LogsSettingsView : UserControl, ISettingsTabView
{
    private const int Keep = 2000;

    private readonly ComboBox levelBox = new() { MinWidth = 160 };
    private readonly TextBox filterBox = new() { MinWidth = 220 };
    private readonly Button pauseButton = new();
    private readonly Button copyButton = new();
    private readonly Button saveButton = new();
    private readonly TextBlock status;
    private readonly TextBlock error = ErrorText();
    private readonly StackPanel lines = new();
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer typing = new() { Interval = TimeSpan.FromMilliseconds(300) };
    private readonly List<LogEntry> entries = [];
    private int? latestId;
    private bool paused;
    private bool loading;
    private bool active;

    public LogsSettingsView()
    {
        status = Caption("");
        foreach (var level in LogLevel.Known)
        {
            levelBox.Items.Add(Loc.Format("Logs_LevelAndUp", level.DisplayName));
        }
        levelBox.SelectedIndex = 1;
        levelBox.SelectionChanged += (_, _) => _ = LoadAsync(fresh: true);
        filterBox.PlaceholderText = Loc.Get("Logs_Filter");
        filterBox.TextChanged += (_, _) =>
        {
            typing.Stop();
            typing.Start();
        };
        typing.Tick += (_, _) =>
        {
            typing.Stop();
            _ = LoadAsync(fresh: true);
        };
        pauseButton.Content = Loc.Get("Logs_Pause");
        pauseButton.Click += (_, _) =>
        {
            paused = !paused;
            pauseButton.Content = paused ? Loc.Get("Logs_Resume") : Loc.Get("Logs_Pause");
            UpdateStatus();
        };
        copyButton.Content = Loc.Get("Logs_Copy");
        copyButton.Click += (_, _) =>
        {
            if (ClipboardText.Copy(Text()))
            {
                copyButton.Content = Loc.Get("Logs_Copied");
            }
        };
        saveButton.Content = Loc.Get("Logs_Save");
        saveButton.Click += async (_, _) => await SaveAsync();
        timer.Tick += (_, _) =>
        {
            if (!paused)
            {
                _ = LoadAsync(fresh: false);
            }
        };

        var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        toolbar.Children.Add(levelBox);
        toolbar.Children.Add(filterBox);
        toolbar.Children.Add(pauseButton);
        toolbar.Children.Add(copyButton);
        toolbar.Children.Add(saveButton);

        var list = new Border
        {
            Style = Resource<Style>("SettingsCard"),
            Padding = new Thickness(0),
            Child = new ScrollViewer { Content = lines, MaxHeight = 640, VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
        };

        var stack = new StackPanel { Spacing = 14 };
        stack.Children.Add(Heading(Loc.Get("Logs_Title"), Loc.Get("Logs_Intro")));
        stack.Children.Add(new ScrollViewer
        {
            Content = toolbar,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
        });
        stack.Children.Add(status);
        stack.Children.Add(error);
        stack.Children.Add(list);
        Content = stack;
    }

    public void Activate()
    {
        active = true;
        timer.Start();
        _ = LoadAsync(fresh: true);
    }

    public void Deactivate()
    {
        active = false;
        timer.Stop();
        typing.Stop();
    }

    private LogLevel SelectedLevel =>
        levelBox.SelectedIndex >= 0 && levelBox.SelectedIndex < LogLevel.Known.Count ? LogLevel.Known[levelBox.SelectedIndex] : LogLevel.Info;

    private async Task LoadAsync(bool fresh)
    {
        if (!active || (loading && !fresh))
        {
            return;
        }
        loading = true;
        try
        {
            var response = await AppServices.Model.Api.Logs.ListAsync(SelectedLevel, filterBox.Text, fresh ? null : latestId);
            if (fresh)
            {
                entries.Clear();
                lines.Children.Clear();
            }
            entries.AddRange(response.Results);
            foreach (var entry in response.Results)
            {
                lines.Children.Add(LineView(entry, lines.Children.Count > 0));
            }
            while (entries.Count > Keep)
            {
                entries.RemoveAt(0);
                lines.Children.RemoveAt(0);
            }
            latestId = response.LatestId;
            Show(error, null);
            copyButton.Content = Loc.Get("Logs_Copy");
        }
        catch (ApiException failure) when (failure.Kind == ApiErrorKind.NotFound)
        {
            timer.Stop();
            Show(error, Loc.Get("Logs_Unsupported"));
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
            loading = false;
            UpdateStatus();
        }
    }

    private void UpdateStatus()
    {
        status.Text = entries.Count == 0
            ? Loc.Get("Logs_Empty")
            : paused
                ? Loc.Plural("Logs_PausedLines", entries.Count)
                : Loc.Plural("Logs_LiveLines", entries.Count);
    }

    private static Grid LineView(LogEntry entry, bool divider)
    {
        var grid = new Grid { Padding = new Thickness(16, 6, 16, 6), ColumnSpacing = 12 };
        if (divider)
        {
            grid.BorderBrush = Resource<Brush>("DividerStrokeColorDefaultBrush");
            grid.BorderThickness = new Thickness(0, 1, 0, 0);
        }
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(150) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(70) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(110) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var mono = new FontFamily("Consolas");
        var time = new TextBlock
        {
            Text = Format.MonthDayTime(entry.Time),
            FontFamily = mono,
            FontSize = 12,
            Foreground = Resource<Brush>("TextFillColorTertiaryBrush"),
        };
        var level = new TextBlock
        {
            Text = entry.Level.DisplayName,
            FontSize = 11,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = Resource<Brush>(entry.Level == LogLevel.Error
                ? "SystemFillColorCriticalBrush"
                : entry.Level == LogLevel.Warn ? "SystemFillColorCautionBrush" : "TextFillColorSecondaryBrush"),
        };
        var source = new TextBlock
        {
            Text = entry.Source,
            FontFamily = mono,
            FontSize = 12,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Foreground = Resource<Brush>("TextFillColorSecondaryBrush"),
        };
        var message = new TextBlock { Text = entry.Message, FontFamily = mono, FontSize = 12, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true };
        Grid.SetColumn(level, 1);
        Grid.SetColumn(source, 2);
        Grid.SetColumn(message, 3);
        grid.Children.Add(time);
        grid.Children.Add(level);
        grid.Children.Add(source);
        grid.Children.Add(message);
        return grid;
    }

    private string Text() => string.Join("\n", entries.Select(entry => entry.TextLine));

    /// <summary>Saves the lines shown as a .log text file where the admin picks.</summary>
    private async Task SaveAsync()
    {
        var picker = new FileSavePicker { SuggestedFileName = "marquee" };
        picker.FileTypeChoices.Add(Loc.Get("Logs_FileType"), [".log", ".txt"]);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, AppServices.WindowHandle);
        var file = await picker.PickSaveFileAsync();
        if (file == null)
        {
            return;
        }
        try
        {
            await File.WriteAllTextAsync(file.Path, Text() + "\n");
        }
        catch (IOException failure)
        {
            Show(error, failure.Message);
        }
        catch (UnauthorizedAccessException failure)
        {
            Show(error, failure.Message);
        }
    }
}
