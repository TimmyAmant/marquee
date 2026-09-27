using Marquee.Core.Connection;

namespace Marquee.Core.Tests;

public sealed class MenuPositionTests
{
    [Theory]
    [InlineData("left", MenuPosition.Left)]
    [InlineData("right", MenuPosition.Right)]
    [InlineData("top", MenuPosition.Top)]
    [InlineData("bottom", MenuPosition.Bottom)]
    [InlineData(" Bottom ", MenuPosition.Bottom)]
    [InlineData("RIGHT", MenuPosition.Right)]
    public void ParsesStoredValues(string stored, MenuPosition expected) =>
        Assert.Equal(expected, MenuPositionSetting.Parse(stored));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("middle")]
    [InlineData("2")]
    public void AnythingElseIsLeft(string? stored) =>
        Assert.Equal(MenuPosition.Left, MenuPositionSetting.Parse(stored));

    [Fact]
    public void RoundTripsThroughTheStore()
    {
        var store = new InMemorySettingsStore();
        Assert.Equal(MenuPosition.Left, MenuPositionSetting.Read(store));

        foreach (var position in MenuPositionSetting.All)
        {
            MenuPositionSetting.Write(store, position);
            Assert.Equal(position.StoredValue(), store.GetString(MenuPositionSetting.Key));
            Assert.Equal(position, MenuPositionSetting.Read(store));
        }
    }

    [Fact]
    public void TopAndBottomAreHorizontal()
    {
        Assert.False(MenuPosition.Left.IsHorizontal());
        Assert.False(MenuPosition.Right.IsHorizontal());
        Assert.True(MenuPosition.Top.IsHorizontal());
        Assert.True(MenuPosition.Bottom.IsHorizontal());
        Assert.Equal(["Left", "Right", "Top", "Bottom"], MenuPositionSetting.All.Select(position => position.Label()));
    }

    [Fact]
    public void MenuLabelsRoundTripAndWidenOnlyASideRail()
    {
        var store = new InMemorySettingsStore();
        Assert.False(MenuLabelsSetting.Read(store));
        MenuLabelsSetting.Write(store, true);
        Assert.Equal("on", store.GetString(MenuLabelsSetting.Key));
        Assert.True(MenuLabelsSetting.Read(store));
        MenuLabelsSetting.Write(store, false);
        Assert.Null(store.GetString(MenuLabelsSetting.Key));
        Assert.False(MenuLabelsSetting.Parse("yes"));
        Assert.True(MenuLabelsSetting.Parse(" ON "));

        Assert.True(MenuLabelsSetting.IsLabeled(true, MenuPosition.Left));
        Assert.True(MenuLabelsSetting.IsLabeled(true, MenuPosition.Right));
        Assert.False(MenuLabelsSetting.IsLabeled(true, MenuPosition.Top));
        Assert.False(MenuLabelsSetting.IsLabeled(false, MenuPosition.Left));
        Assert.Equal(232, MenuLabelsSetting.Clearance(true));
        Assert.Equal(72, MenuLabelsSetting.Clearance(false));
    }
}
