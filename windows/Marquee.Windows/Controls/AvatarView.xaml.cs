using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Controls;

/// <summary>
/// An account's round picture. Set <see cref="Label"/> (the name the
/// initials come from), <see cref="AvatarUrl"/> (the server's
/// <c>avatarUrl</c>, empty for none) and <see cref="Diameter"/>; all three
/// bind in a DataTemplate. The initials show until the photo has loaded,
/// and stay when there is none or it can't be fetched.
///
/// Only strings and numbers on purpose: a Core record as a public property
/// of a XAML class breaks the XAML compiler's generated code (CS9035).
/// </summary>
public sealed partial class AvatarView : UserControl
{
    public static readonly DependencyProperty LabelProperty = DependencyProperty.Register(
        nameof(Label),
        typeof(string),
        typeof(AvatarView),
        new PropertyMetadata("", OnLabelChanged));

    public static readonly DependencyProperty AvatarUrlProperty = DependencyProperty.Register(
        nameof(AvatarUrl),
        typeof(string),
        typeof(AvatarView),
        new PropertyMetadata("", OnAvatarUrlChanged));

    public static readonly DependencyProperty DiameterProperty = DependencyProperty.Register(
        nameof(Diameter),
        typeof(double),
        typeof(AvatarView),
        new PropertyMetadata(36.0, OnGeometryChanged));

    public static readonly DependencyProperty RingThicknessProperty = DependencyProperty.Register(
        nameof(RingThickness),
        typeof(double),
        typeof(AvatarView),
        new PropertyMetadata(0.0, OnGeometryChanged));

    /// <summary>Bumped for every new URL, so a photo that arrives late for an old one is dropped.</summary>
    private int photoGeneration;

    public AvatarView()
    {
        InitializeComponent();
        // Decoration beside a name (or inside a button) that is already read out.
        AutomationProperties.SetAccessibilityView(this, Microsoft.UI.Xaml.Automation.Peers.AccessibilityView.Raw);
        ApplyGeometry();
        ApplyLabel();
    }

    /// <summary>The account's name: display name, else username. Up to two initials come from it.</summary>
    public string Label
    {
        get => (string)GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    /// <summary>The server-relative photo path, or empty (null) for initials only.</summary>
    public string AvatarUrl
    {
        get => (string)GetValue(AvatarUrlProperty);
        set => SetValue(AvatarUrlProperty, value);
    }

    /// <summary>The whole control, ring included.</summary>
    public double Diameter
    {
        get => (double)GetValue(DiameterProperty);
        set => SetValue(DiameterProperty, value);
    }

    /// <summary>The ring around the picture (the rail's is 2); 0 for none.</summary>
    public double RingThickness
    {
        get => (double)GetValue(RingThicknessProperty);
        set => SetValue(RingThicknessProperty, value);
    }

    /// <summary>
    /// Plex's round profile photo, with initials standing in: the first
    /// letter of up to two words, uppercased, or "?" without a name.
    /// </summary>
    public static string Initials(string? label)
    {
        var initials = string.Concat((label ?? "")
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
            .Take(2)
            .Select(word => (char.IsSurrogatePair(word, 0) ? word[..2] : word[..1]).ToUpperInvariant()));
        return initials.Length > 0 ? initials : "?";
    }

    private static void OnLabelChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((AvatarView)sender).ApplyLabel();

    private static void OnAvatarUrlChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((AvatarView)sender).LoadPhoto();

    private static void OnGeometryChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((AvatarView)sender).ApplyGeometry();

    private void ApplyLabel() => InitialsText.Text = Initials(Label);

    private void ApplyGeometry()
    {
        var diameter = Math.Max(0, Diameter);
        var ring = Math.Clamp(RingThickness, 0, diameter / 2);
        PictureFrame.Width = diameter;
        PictureFrame.Height = diameter;
        PictureFrame.CornerRadius = new CornerRadius(diameter / 2);
        PictureFrame.BorderThickness = new Thickness(ring);
        var inner = diameter - (2 * ring);
        PhotoEllipse.Width = inner;
        PhotoEllipse.Height = inner;
        InitialsText.FontSize = Math.Max(1, inner * 0.38);
    }

    /// <summary>
    /// Shows the photo for the current <see cref="AvatarUrl"/>: at once when
    /// it's already in memory, else once it arrives (the initials meanwhile).
    /// </summary>
    private async void LoadPhoto()
    {
        var generation = ++photoGeneration;
        if (AvatarUrl.NonBlank() is not { } url)
        {
            ShowPhoto(null);
            return;
        }
        if (AvatarImages.TryGetLoaded(url, out var loaded))
        {
            ShowPhoto(loaded);
            return;
        }
        ShowPhoto(null);
        var image = await AvatarImages.LoadAsync(url);
        if (generation == photoGeneration)
        {
            ShowPhoto(image);
        }
    }

    private void ShowPhoto(ImageSource? image)
    {
        if (image == null)
        {
            PhotoEllipse.Fill = null;
            PhotoEllipse.Visibility = Visibility.Collapsed;
            return;
        }
        PhotoEllipse.Fill = new ImageBrush { ImageSource = image, Stretch = Stretch.UniformToFill };
        PhotoEllipse.Visibility = Visibility.Visible;
    }
}
