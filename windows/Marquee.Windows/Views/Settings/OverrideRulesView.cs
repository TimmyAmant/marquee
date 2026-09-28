using System.Globalization;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using static Marquee.Windows.Views.Settings.AdminToolsUi;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Services › Override rules (0.58+; the website's
/// components/override-rules-card.tsx, the Mac's OverrideRulesSection):
/// each rule — where matching requests go and when — with Edit and Remove,
/// Add rule, and the rule being edited as rows under the list. Requests are
/// matched when approved; picks made by hand still win. Hidden on an older
/// server (404).
/// </summary>
public sealed partial class OverrideRulesView : UserControl, ISettingsTabView
{
    /// <summary>The languages a rule can pick, as Discover offers them (ISO 639-1).</summary>
    private static readonly string[] Languages =
    [
        "en", "es", "fr", "de", "pt", "it", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "el",
        "tr", "ru", "uk", "he", "ar", "hi", "ta", "te", "ja", "ko", "zh", "th", "id", "ms", "tl", "vi",
    ];

    private readonly StackPanel list = new() { Spacing = 10 };
    private readonly StackPanel editor = new() { Spacing = 12, Visibility = Visibility.Collapsed };
    private readonly TextBlock error = ErrorText();
    private readonly Button addButton = new();
    private IReadOnlyList<OverrideRule> rules = [];
    private IReadOnlyList<ArrServer> servers = [];
    private IReadOnlyList<HouseholdMember> members = [];
    private OverrideRule? editing;

    // The editor's controls, rebuilt for each rule.
    private readonly TextBox nameBox = new();
    private readonly ComboBox serverBox = new() { HorizontalAlignment = HorizontalAlignment.Stretch };
    private readonly VariableSizedWrapGrid genreGrid = WrapGrid();
    private readonly VariableSizedWrapGrid languageGrid = WrapGrid();
    private readonly VariableSizedWrapGrid memberGrid = WrapGrid();
    private readonly VariableSizedWrapGrid tagGrid = WrapGrid();
    private readonly TextBox keywordSearch = new();
    private readonly StackPanel keywordChips = new() { Orientation = Orientation.Horizontal, Spacing = 6 };
    private readonly StackPanel keywordResults = new() { Orientation = Orientation.Horizontal, Spacing = 6 };
    private readonly ComboBox profileBox = new() { HorizontalAlignment = HorizontalAlignment.Stretch };
    private readonly ComboBox folderBox = new() { HorizontalAlignment = HorizontalAlignment.Stretch };
    private readonly ToggleSwitch enabledSwitch = new();
    private readonly TextBlock editorError = ErrorText();
    private readonly List<RuleKeyword> keywords = [];
    private ArrServerOptions? options;
    private bool filling;

    public OverrideRulesView()
    {
        addButton.Content = Loc.Get("Rules_Add");
        addButton.Click += (_, _) =>
        {
            if (servers.Count > 0)
            {
                Edit(new OverrideRule { ServerId = servers[0].Id, Name = "" });
            }
        };
        nameBox.Header = Loc.Get("Rules_Name");
        nameBox.PlaceholderText = Loc.Get("Rules_NamePlaceholder");
        nameBox.MaxLength = 80;
        serverBox.SelectionChanged += async (_, _) =>
        {
            if (!filling)
            {
                await LoadServerAsync(clearPicks: true);
            }
        };
        keywordSearch.PlaceholderText = Loc.Get("Rules_KeywordSearch");
        keywordSearch.KeyDown += async (_, e) =>
        {
            if (e.Key == global::Windows.System.VirtualKey.Enter)
            {
                await SearchKeywordsAsync();
            }
        };
        enabledSwitch.Header = Loc.Get("Rules_Enabled");
        profileBox.Header = Loc.Get("Rules_Profile");
        folderBox.Header = Loc.Get("Rules_Folder");

        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Heading(Loc.Get("Rules_Title"), Loc.Get("Rules_Intro"), subtitle: false));
        stack.Children.Add(list);
        stack.Children.Add(addButton);
        stack.Children.Add(error);
        stack.Children.Add(editor);
        Content = stack;
    }

    private static VariableSizedWrapGrid WrapGrid() => new() { Orientation = Orientation.Horizontal, ItemWidth = 150, ItemHeight = 34, MaximumRowsOrColumns = 2 };

    public void Activate() => _ = LoadAsync();

    public void Deactivate()
    {
    }

    private async Task LoadAsync()
    {
        try
        {
            var api = AppServices.Model.Api;
            rules = await api.OverrideRules.ListAsync();
            servers = (await api.Integrations.OverviewAsync()).ArrServers ?? [];
            members = await api.Users.ListAsync();
            Show(error, null);
            Visibility = Visibility.Visible;
            ShowList();
        }
        catch (ApiException failure) when (failure.Kind == ApiErrorKind.NotFound)
        {
            // An older server: no override rules.
            Visibility = Visibility.Collapsed;
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation)
            {
                Show(error, failure.Message);
            }
        }
    }

    private string ServerLabel(string id)
    {
        if (servers.FirstOrDefault(server => server.Id == id) is not { } server)
        {
            return Loc.Get("Rules_RemovedServer");
        }
        var kind = server.Kind == ArrProvider.Sonarr ? "Sonarr" : "Radarr";
        return server.Is4k ? $"{server.Name} · 4K {kind}" : $"{server.Name} · {kind}";
    }

    private static string LanguageName(string code)
    {
        try
        {
            return new CultureInfo(code).DisplayName;
        }
        catch (CultureNotFoundException)
        {
            return code.ToUpperInvariant();
        }
    }

    private void ShowList()
    {
        list.Children.Clear();
        addButton.IsEnabled = servers.Count > 0;
        if (servers.Count == 0)
        {
            list.Children.Add(Caption(Loc.Get("Rules_NeedsServer")));
            return;
        }
        foreach (var rule in rules)
        {
            var conditions = new List<string>();
            if (rule.Genres.Count > 0)
            {
                conditions.Add(Loc.Plural("Rules_GenreCount", rule.Genres.Count));
            }
            conditions.AddRange(rule.Languages.Select(LanguageName));
            conditions.AddRange(rule.Keywords.Select(keyword => keyword.Name));
            conditions.AddRange(rule.UserIds.Select(id =>
                members.FirstOrDefault(member => string.Equals(member.Id.ToString("D"), id, StringComparison.OrdinalIgnoreCase)) is { } member
                    ? member.DisplayName.NonBlank() ?? member.Username
                    : Loc.Get("Rules_FormerMember")));

            var text = new StackPanel { Spacing = 2 };
            text.Children.Add(new TextBlock { Text = rule.Name, Style = Resource<Style>("BodyStrongTextBlockStyle") });
            text.Children.Add(Caption(Loc.Format("Rules_GoesTo", ServerLabel(rule.ServerId))));
            text.Children.Add(Caption(conditions.Count == 0 ? Loc.Get("Rules_EveryRequest") : string.Join(" · ", conditions), secondary: false));
            text.Children.Add(Caption(rule.Enabled ? Loc.Get("Rules_On") : Loc.Get("Rules_Off")));

            var edit = new Button { Content = Loc.Get("Rules_Edit") };
            edit.Click += (_, _) => Edit(rule);
            var remove = new Button { Content = Loc.Get("Rules_Remove") };
            remove.Click += async (_, _) => await RemoveAsync(rule, remove);
            var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
            buttons.Children.Add(edit);
            buttons.Children.Add(remove);

            var row = new Microsoft.UI.Xaml.Controls.Grid { Padding = new Thickness(18, 12, 18, 12), ColumnSpacing = 12 };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(text);
            Microsoft.UI.Xaml.Controls.Grid.SetColumn(buttons, 1);
            row.Children.Add(buttons);
            list.Children.Add(new Border { Style = Resource<Style>("SettingsCard"), Padding = new Thickness(0), Child = row });
        }
    }

    private async Task RemoveAsync(OverrideRule rule, Button button)
    {
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = Loc.Format("Rules_RemoveConfirm", rule.Name),
            PrimaryButtonText = Loc.Get("Rules_Remove"),
            CloseButtonText = Loc.Get("Rules_Keep"),
            DefaultButton = ContentDialogButton.Close,
        };
        if (await dialog.TryShowAsync() != ContentDialogResult.Primary)
        {
            return;
        }
        button.IsEnabled = false;
        try
        {
            await AppServices.Model.Api.OverrideRules.DeleteAsync(rule.Id);
            rules = rules.Where(other => other.Id != rule.Id).ToList();
            ShowList();
        }
        catch (ApiException failure)
        {
            Show(error, failure.Message);
            button.IsEnabled = true;
        }
    }

    // MARK: Editing

    private void Edit(OverrideRule rule)
    {
        editing = rule;
        filling = true;
        nameBox.Text = rule.Name;
        serverBox.Items.Clear();
        foreach (var server in servers)
        {
            serverBox.Items.Add(ServerLabel(server.Id));
        }
        serverBox.SelectedIndex = Math.Max(0, servers.ToList().FindIndex(server => server.Id == rule.ServerId));
        enabledSwitch.IsOn = rule.Enabled;
        keywords.Clear();
        keywords.AddRange(rule.Keywords);
        keywordResults.Children.Clear();
        keywordSearch.Text = "";
        Fill(languageGrid, Languages.Select(code => (code, LanguageName(code))), rule.Languages);
        Fill(memberGrid, members.Select(member => (member.Id.ToString("D"), member.DisplayName.NonBlank() ?? member.Username)), rule.UserIds);
        ShowKeywords();
        filling = false;
        BuildEditor();
        _ = LoadServerAsync(clearPicks: false);
    }

    private static void Fill(VariableSizedWrapGrid grid, IEnumerable<(string Id, string Label)> choices, IEnumerable<string> picked)
    {
        var chosen = picked.Select(value => value.ToLowerInvariant()).ToHashSet();
        grid.Children.Clear();
        foreach (var (id, label) in choices)
        {
            grid.Children.Add(new CheckBox { Content = label, Tag = id, IsChecked = chosen.Contains(id.ToLowerInvariant()) });
        }
    }

    private static List<string> Picked(VariableSizedWrapGrid grid) =>
        grid.Children.OfType<CheckBox>().Where(box => box.IsChecked == true).Select(box => (string)box.Tag).ToList();

    private void BuildEditor()
    {
        editor.Children.Clear();
        editor.Children.Add(Heading(
            editing?.Id.Length > 0 ? Loc.Get("Rules_EditTitle") : Loc.Get("Rules_AddTitle"),
            Loc.Get("Rules_EditorHelp"),
            subtitle: false));

        var keywordBox = new StackPanel { Spacing = 6 };
        var searchRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        keywordSearch.MinWidth = 220;
        var searchButton = new Button { Content = Loc.Get("Rules_Search") };
        searchButton.Click += async (_, _) => await SearchKeywordsAsync();
        searchRow.Children.Add(keywordSearch);
        searchRow.Children.Add(searchButton);
        keywordBox.Children.Add(searchRow);
        keywordBox.Children.Add(new ScrollViewer { Content = keywordChips, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled });
        keywordBox.Children.Add(new ScrollViewer { Content = keywordResults, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled });

        var save = new Button { Content = Loc.Get("Rules_Save"), Style = Resource<Style>("AccentButtonStyle") };
        save.Click += async (_, _) => await SaveAsync(save);
        var cancel = new Button { Content = Loc.Get("Rules_Cancel") };
        cancel.Click += (_, _) =>
        {
            editing = null;
            editor.Visibility = Visibility.Collapsed;
        };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Padding = new Thickness(20, 12, 20, 14) };
        buttons.Children.Add(save);
        buttons.Children.Add(cancel);

        editor.Children.Add(Card(
            Row(nameBox),
            LabeledRow(Loc.Get("Rules_Server"), Loc.Get("Rules_ServerHelp"), serverBox),
            LabeledRow(Loc.Get("Rules_Genres"), Loc.Get("Rules_AnyHelp"), Choices(genreGrid)),
            LabeledRow(Loc.Get("Rules_Languages"), Loc.Get("Rules_AnyHelp"), Choices(languageGrid)),
            LabeledRow(Loc.Get("Rules_Keywords"), Loc.Get("Rules_KeywordsHelp"), keywordBox),
            LabeledRow(Loc.Get("Rules_Members"), Loc.Get("Rules_MembersHelp"), Choices(memberGrid)),
            Row(profileBox),
            Row(folderBox),
            LabeledRow(Loc.Get("Rules_Tags"), Loc.Get("Rules_TagsHelp"), Choices(tagGrid)),
            Row(enabledSwitch),
            buttons));
        editor.Children.Add(editorError);
        Show(editorError, null);
        editor.Visibility = Visibility.Visible;
    }

    private ArrServer? SelectedServer =>
        serverBox.SelectedIndex >= 0 && serverBox.SelectedIndex < servers.Count ? servers[serverBox.SelectedIndex] : null;

    /// <summary>The chosen server's profiles, folders, tags and TMDb's genres for its kind.</summary>
    private async Task LoadServerAsync(bool clearPicks)
    {
        if (SelectedServer is not { } server || editing is not { } rule)
        {
            return;
        }
        var api = AppServices.Model.Api;
        var pickedGenres = clearPicks ? Enumerable.Empty<string>() : rule.Genres.Select(id => id.ToString(CultureInfo.InvariantCulture));
        var pickedTags = clearPicks ? Enumerable.Empty<string>() : (rule.Tags ?? []).Select(id => id.ToString(CultureInfo.InvariantCulture));
        try
        {
            var genres = await api.DiscoverSettings.LookupAsync(
                DiscoverLookupKind.Genre, "", server.Kind == ArrProvider.Sonarr ? ShelfMediaType.Tv : ShelfMediaType.Movie);
            Fill(genreGrid, genres.Select(genre => (genre.TmdbId.ToString(CultureInfo.InvariantCulture), genre.Name)), pickedGenres);
        }
        catch (ApiException)
        {
            genreGrid.Children.Clear();
        }
        try
        {
            options = await api.Integrations.ArrServers.OptionsAsync(server.Id);
            Show(editorError, null);
        }
        catch (ApiException failure)
        {
            options = null;
            Show(editorError, failure.Message);
        }
        profileBox.Items.Clear();
        profileBox.Items.Add(Loc.Get("Rules_ServerDefault"));
        foreach (var profile in options?.QualityProfiles ?? [])
        {
            profileBox.Items.Add(profile.Name);
        }
        var profileIndex = clearPicks ? -1 : (options?.QualityProfiles ?? []).ToList().FindIndex(profile => profile.Id == rule.QualityProfileId);
        profileBox.SelectedIndex = profileIndex + 1;
        folderBox.Items.Clear();
        folderBox.Items.Add(Loc.Get("Rules_ServerDefault"));
        foreach (var folder in options?.RootFolders ?? [])
        {
            folderBox.Items.Add(folder.Path);
        }
        var folderIndex = clearPicks ? -1 : (options?.RootFolders ?? []).ToList().FindIndex(folder => folder.Path == rule.RootFolderPath);
        folderBox.SelectedIndex = folderIndex + 1;
        Fill(tagGrid, (options?.Tags ?? []).Select(tag => (tag.Id.ToString(CultureInfo.InvariantCulture), tag.Label)), pickedTags);
    }

    private async Task SearchKeywordsAsync()
    {
        if (keywordSearch.Text.Trim().NonBlank() is not { } query)
        {
            return;
        }
        try
        {
            var found = await AppServices.Model.Api.DiscoverSettings.LookupAsync(DiscoverLookupKind.Keyword, query);
            keywordResults.Children.Clear();
            foreach (var result in found.Where(result => keywords.All(keyword => keyword.Id != result.TmdbId)).Take(12))
            {
                var add = new Button { Content = $"+ {result.Name}" };
                add.Click += (_, _) =>
                {
                    keywords.Add(new RuleKeyword { Id = result.TmdbId, Name = result.Name });
                    keywordResults.Children.Remove(add);
                    ShowKeywords();
                };
                keywordResults.Children.Add(add);
            }
        }
        catch (ApiException failure)
        {
            Show(editorError, failure.Message);
        }
    }

    private void ShowKeywords()
    {
        keywordChips.Children.Clear();
        foreach (var keyword in keywords.ToList())
        {
            var chip = new Button { Content = $"{keyword.Name} ×" };
            chip.Click += (_, _) =>
            {
                keywords.RemoveAll(other => other.Id == keyword.Id);
                ShowKeywords();
            };
            keywordChips.Children.Add(chip);
        }
    }

    private async Task SaveAsync(Button save)
    {
        if (editing is not { } rule || SelectedServer is not { } server)
        {
            return;
        }
        var profiles = options?.QualityProfiles ?? [];
        var folders = options?.RootFolders ?? [];
        var tags = Picked(tagGrid).Select(id => int.Parse(id, CultureInfo.InvariantCulture)).ToList();
        var updated = rule with
        {
            Name = nameBox.Text.Trim(),
            ServerId = server.Id,
            Enabled = enabledSwitch.IsOn,
            Genres = Picked(genreGrid).Select(id => int.Parse(id, CultureInfo.InvariantCulture)).ToList(),
            Languages = Picked(languageGrid),
            Keywords = keywords.ToList(),
            UserIds = Picked(memberGrid),
            QualityProfileId = profileBox.SelectedIndex > 0 && profileBox.SelectedIndex <= profiles.Count ? profiles[profileBox.SelectedIndex - 1].Id : null,
            RootFolderPath = folderBox.SelectedIndex > 0 && folderBox.SelectedIndex <= folders.Count ? folders[folderBox.SelectedIndex - 1].Path : null,
            Tags = tags.Count > 0 ? tags : null,
        };
        save.IsEnabled = false;
        try
        {
            var saved = await AppServices.Model.Api.OverrideRules.SaveAsync(updated);
            rules = rule.Id.Length == 0
                ? [.. rules, saved]
                : rules.Select(other => other.Id == saved.Id ? saved : other).ToList();
            editing = null;
            editor.Visibility = Visibility.Collapsed;
            ShowList();
        }
        catch (ApiException failure)
        {
            Show(editorError, failure.Message);
        }
        finally
        {
            save.IsEnabled = true;
        }
    }
}
