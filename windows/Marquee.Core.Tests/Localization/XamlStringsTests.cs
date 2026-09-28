using System.Xml;
using System.Xml.Linq;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests.Localization;

/// <summary>
/// The WinUI pages only compile on Windows, so their text is checked here,
/// on any platform: every XAML file parses, no attribute or element shows
/// literal prose (text comes from Resources.resw through <c>x:Uid</c>, or
/// from a binding), every <c>x:Uid</c> has strings, and every string a
/// <c>x:Uid</c> sets is a property that element has, since XAML only finds
/// out at run time, when the page fails to load.
/// </summary>
public sealed class XamlStringsTests
{
    private static readonly XNamespace Xaml = "http://schemas.microsoft.com/winfx/2006/xaml";

    /// <summary>Attributes people read (or hear, for a screen reader).</summary>
    private static readonly HashSet<string> TextAttributes =
    [
        "Text", "Content", "Header", "PlaceholderText", "Title", "Subtitle", "Description", "Message", "Label",
        "PrimaryButtonText", "SecondaryButtonText", "CloseButtonText", "OnContent", "OffContent",
        "ToolTipService.ToolTip", "AutomationProperties.Name", "AutomationProperties.HelpText",
        "PaneTitle", "ActionButtonContent", "CloseButtonContent", "PlaceholderValue",
    ];

    /// <summary>Elements whose own text content is shown: <c>&lt;Run&gt;Hello&lt;/Run&gt;</c>, <c>&lt;x:String&gt;Left&lt;/x:String&gt;</c>.</summary>
    internal static readonly HashSet<string> TextElements =
    [
        "TextBlock", "RichTextBlock", "Paragraph", "Run", "Span", "Bold", "Italic", "Underline", "Hyperlink", "String",
        "ComboBoxItem", "ListViewItem", "ListBoxItem", "Button", "HyperlinkButton", "CheckBox", "RadioButton",
        "ToggleButton", "ToolTip", "ContentControl", "TextBox", "NavigationViewItem", "MenuFlyoutItem",
    ];

    /// <summary>
    /// Literal values that aren't prose: brand names, which are never
    /// translated (docs/i18n-glossary.md), and a few symbols.
    /// </summary>
    internal static readonly HashSet<string> Allowed =
    [
        "Marquee", "Plex", "Jellyfin", "Emby", "Sonarr", "Radarr", "TMDb", "TheTVDB", "IMDb", "Trakt", "Discord",
        "Telegram", "Pushover", "ntfy", "Gotify", "Slack", "Pushbullet", "Homepage", "Homarr", "Organizr", "Unraid", "GitHub",
        "OpenAPI", "4K", "HDR", "Plex Watchlist", "Quick Connect", "API", "URL", "Webhook", "OK",
        "Instagram", "Facebook", "X / Twitter", "Twitter", "TikTok", "YouTube",
    ];

    /// <summary>What an <c>x:Uid</c>'s strings may set on each element (plus <see cref="AnyElement"/>).</summary>
    private static readonly Dictionary<string, string[]> Properties = new()
    {
        ["TextBlock"] = ["Text"],
        ["Run"] = ["Text"],
        ["Button"] = ["Content"],
        ["HyperlinkButton"] = ["Content"],
        ["CheckBox"] = ["Content"],
        ["RadioButton"] = ["Content"],
        ["ToggleButton"] = ["Content"],
        ["RepeatButton"] = ["Content"],
        ["DropDownButton"] = ["Content"],
        ["SplitButton"] = ["Content"],
        ["ToggleSplitButton"] = ["Content"],
        ["ComboBoxItem"] = ["Content"],
        ["ListViewItem"] = ["Content"],
        ["ListBoxItem"] = ["Content"],
        ["ContentControl"] = ["Content"],
        ["ContentPresenter"] = ["Content"],
        ["NavigationViewItem"] = ["Content"],
        ["NavigationViewItemHeader"] = ["Content"],
        ["SelectorBarItem"] = ["Text"],
        ["MenuFlyoutItem"] = ["Text"],
        ["ToggleMenuFlyoutItem"] = ["Text"],
        ["RadioMenuFlyoutItem"] = ["Text"],
        ["MenuFlyoutSubItem"] = ["Text"],
        ["MenuBarItem"] = ["Title"],
        ["AppBarButton"] = ["Label"],
        ["AppBarToggleButton"] = ["Label"],
        ["TextBox"] = ["Header", "PlaceholderText", "Description"],
        ["PasswordBox"] = ["Header", "PlaceholderText", "Description"],
        ["ComboBox"] = ["Header", "PlaceholderText", "Description"],
        ["NumberBox"] = ["Header", "PlaceholderText", "Description"],
        ["AutoSuggestBox"] = ["Header", "PlaceholderText", "Description"],
        ["RichEditBox"] = ["Header", "PlaceholderText", "Description"],
        ["CalendarDatePicker"] = ["Header", "PlaceholderText", "Description"],
        ["DatePicker"] = ["Header"],
        ["TimePicker"] = ["Header"],
        ["Slider"] = ["Header"],
        ["ToggleSwitch"] = ["Header", "OnContent", "OffContent"],
        ["RadioButtons"] = ["Header"],
        ["Expander"] = ["Header"],
        ["TabViewItem"] = ["Header"],
        ["PivotItem"] = ["Header"],
        ["ContentDialog"] = ["Title", "PrimaryButtonText", "SecondaryButtonText", "CloseButtonText"],
        ["InfoBar"] = ["Title", "Message"],
        ["TeachingTip"] = ["Title", "Subtitle", "ActionButtonContent", "CloseButtonContent"],
        ["NavigationView"] = ["PaneTitle"],
        ["PersonPicture"] = ["DisplayName"],
        ["ToolTip"] = ["Content"],
    };

    /// <summary>Attached properties every element has.</summary>
    private static readonly string[] AnyElement =
    [
        "[using:Microsoft.UI.Xaml.Controls]ToolTipService.ToolTip",
        "[using:Microsoft.UI.Xaml.Automation]AutomationProperties.Name",
        "[using:Microsoft.UI.Xaml.Automation]AutomationProperties.HelpText",
    ];

    public static IEnumerable<string> XamlFiles => SourceTree.SourceFiles(SourceTree.App, ".xaml");

    private static string Relative(string path) => Path.GetRelativePath(SourceTree.App, path).Replace('\\', '/');

    private static XDocument Load(string path) => XDocument.Load(path, LoadOptions.SetLineInfo);

    private static int Line(XObject node) => ((IXmlLineInfo)node).LineNumber;

    [Fact]
    public void EveryXamlFileParses()
    {
        var problems = new List<string>();
        foreach (var file in XamlFiles)
        {
            try
            {
                Load(file);
            }
            catch (XmlException error)
            {
                problems.Add($"{Relative(file)}: {error.Message}");
            }
        }
        Assert.NotEmpty(XamlFiles);
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact]
    public void NoLiteralProse()
    {
        var problems = new List<string>();
        foreach (var file in XamlFiles)
        {
            foreach (var element in Load(file).Descendants())
            {
                foreach (var attribute in element.Attributes())
                {
                    if (attribute.IsNamespaceDeclaration || attribute.Name.Namespace != XNamespace.None)
                    {
                        continue;
                    }
                    var name = attribute.Name.LocalName;
                    var property = name.Contains('.') ? name : name;
                    if (!TextAttributes.Contains(property) && !TextAttributes.Contains(property.Split('.').Last()))
                    {
                        continue;
                    }
                    if (IsProse(attribute.Value))
                    {
                        problems.Add($"{Relative(file)}:{Line(attribute)} {element.Name.LocalName}.{name}=\"{attribute.Value}\"");
                    }
                }
                if (!TextElements.Contains(element.Name.LocalName))
                {
                    continue; // <FontFamily>Georgia</FontFamily> and other values
                }
                foreach (var text in element.Nodes().OfType<XText>())
                {
                    if (IsProse(text.Value.Trim()))
                    {
                        problems.Add($"{Relative(file)}:{Line(text)} <{element.Name.LocalName}>{text.Value.Trim()}</{element.Name.LocalName}>");
                    }
                }
            }
        }
        Assert.True(problems.Count == 0, "Literal text in XAML (give the element an x:Uid and put the text in Strings/*/Resources.resw):\n" + string.Join("\n", problems));
    }

    [Fact]
    public void EveryUidHasStringsForPropertiesItsElementHas()
    {
        var byUid = Resw.English.Keys
            .Where(key => key.Contains('.'))
            .GroupBy(key => key[..key.IndexOf('.')])
            .ToDictionary(group => group.Key, group => group.Select(key => key[(key.IndexOf('.') + 1)..]).ToList());
        var problems = new List<string>();
        var used = new HashSet<string>();
        foreach (var file in XamlFiles)
        {
            foreach (var element in Load(file).Descendants())
            {
                if (element.Attribute(Xaml + "Uid") is not { } uidAttribute)
                {
                    continue;
                }
                var uid = uidAttribute.Value;
                used.Add(uid);
                if (!byUid.TryGetValue(uid, out var properties))
                {
                    problems.Add($"{Relative(file)}:{Line(uidAttribute)} x:Uid=\"{uid}\" has no strings in en-US/Resources.resw");
                    continue;
                }
                var type = element.Name.LocalName;
                var own = Properties.GetValueOrDefault(type);
                // A control of the app's own (local:, controls:) sets its own
                // properties; only the framework's are checked.
                var isFramework = element.Name.NamespaceName == "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
                foreach (var property in properties)
                {
                    if (AnyElement.Contains(property))
                    {
                        continue;
                    }
                    if (!isFramework)
                    {
                        continue;
                    }
                    if (own == null || !own.Contains(property))
                    {
                        problems.Add($"{Relative(file)}:{Line(uidAttribute)} {uid}.{property}: a {type} has no {property} this test knows of (fix the key, or add the property to XamlStringsTests.Properties if it really exists)");
                    }
                }
            }
        }
        var orphans = byUid.Keys.Where(uid => !used.Contains(uid)).Order(StringComparer.Ordinal).ToList();
        foreach (var orphan in orphans)
        {
            problems.Add($"{orphan}.*: strings for an x:Uid no XAML uses");
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact]
    public void UidsAreUniquePerFile()
    {
        var problems = new List<string>();
        foreach (var file in XamlFiles)
        {
            var seen = new HashSet<string>();
            foreach (var element in Load(file).Descendants())
            {
                if (element.Attribute(Xaml + "Uid") is { } uid && !seen.Add(uid.Value))
                {
                    // Allowed (the same strings on two elements), but a copy-paste slip more often than not.
                    problems.Add($"{Relative(file)}:{Line(uid)} x:Uid=\"{uid.Value}\" twice");
                }
            }
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    /// <summary>
    /// Text people would read: has a letter, isn't markup (a binding, a
    /// resource reference) or an allowed brand name. Icon glyphs are private
    /// use characters, not letters.
    /// </summary>
    internal static bool IsProse(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.Length == 0 || trimmed.StartsWith('{') || Allowed.Contains(trimmed))
        {
            return false;
        }
        return trimmed.Any(char.IsLetter);
    }
}
