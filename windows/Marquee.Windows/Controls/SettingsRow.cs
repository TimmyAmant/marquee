using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Controls;

/// <summary>
/// One setting as a row (the website's SettingRow, the Mac's SettingsField):
/// the label and any help on the left, the control on the right — stacked
/// when the pane is too narrow for both. Wrap a field in it and its own
/// <c>Header</c> (set through its x:Uid) becomes the row's label, and its
/// <c>Description</c> the help, so the strings stay where they are:
/// <c>&lt;controls:SettingsRow&gt;&lt;TextBox x:Uid="…" /&gt;&lt;/controls:SettingsRow&gt;</c>.
/// </summary>
[ContentProperty(Name = nameof(Field))]
public sealed partial class SettingsRow : UserControl
{
    /// <summary>Below this width the label goes above the field.</summary>
    private const double StackBelow = 560;
    private const double FieldWidth = 320;

    public static readonly DependencyProperty FieldProperty = DependencyProperty.Register(
        nameof(Field), typeof(UIElement), typeof(SettingsRow), new PropertyMetadata(null, OnFieldChanged));

    private readonly Grid grid = new() { ColumnSpacing = 24, RowSpacing = 6 };
    private readonly TextBlock label = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock help = new() { TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
    private readonly ContentPresenter presenter = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private bool stacked;

    public SettingsRow()
    {
        label.Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"];
        help.Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"];
        help.Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"];

        var caption = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        caption.Children.Add(label);
        caption.Children.Add(help);

        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(FieldWidth) });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.Children.Add(caption);
        grid.Children.Add(presenter);
        Content = grid;
        Layout(stack: false);

        Loaded += (_, _) => TakeHeader();
        SizeChanged += (_, e) =>
        {
            var stack = e.NewSize.Width < StackBelow;
            if (stack != stacked)
            {
                Layout(stack);
            }
        };
    }

    /// <summary>The control on the right: a TextBox, PasswordBox, ComboBox, NumberBox, ToggleSwitch…</summary>
    public UIElement? Field
    {
        get => (UIElement?)GetValue(FieldProperty);
        set => SetValue(FieldProperty, value);
    }

    private static void OnFieldChanged(DependencyObject sender, DependencyPropertyChangedEventArgs e)
    {
        var row = (SettingsRow)sender;
        row.presenter.Content = e.NewValue;
        row.TakeHeader();
    }

    private void Layout(bool stack)
    {
        stacked = stack;
        var caption = (FrameworkElement)grid.Children[0];
        Grid.SetRow(caption, 0);
        Grid.SetColumn(caption, 0);
        Grid.SetColumnSpan(caption, stack ? 2 : 1);
        Grid.SetRow(presenter, stack ? 1 : 0);
        Grid.SetColumn(presenter, stack ? 0 : 1);
        Grid.SetColumnSpan(presenter, stack ? 2 : 1);
        grid.ColumnDefinitions[1].Width = stack ? new GridLength(0) : new GridLength(FieldWidth);
    }

    /// <summary>Moves the field's own header (and description) into the row, once its strings are in.</summary>
    private void TakeHeader()
    {
        switch (Field)
        {
            case TextBox box:
                Take(box.Header, box.Description, () => { box.Header = null; box.Description = null; });
                break;
            case PasswordBox box:
                Take(box.Header, box.Description, () => { box.Header = null; box.Description = null; });
                break;
            case ComboBox box:
                Take(box.Header, box.Description, () => { box.Header = null; box.Description = null; });
                break;
            case NumberBox box:
                Take(box.Header, box.Description, () => { box.Header = null; box.Description = null; });
                break;
            case ToggleSwitch toggle:
                Take(toggle.Header, null, () => toggle.Header = null);
                break;
        }
    }

    private void Take(object? header, object? description, Action clear)
    {
        if (header is string text && text.Length > 0)
        {
            label.Text = text;
        }
        if (description is string line && line.Length > 0)
        {
            help.Text = line;
            help.Visibility = Visibility.Visible;
        }
        if (header != null || description != null)
        {
            clear();
        }
    }
}
