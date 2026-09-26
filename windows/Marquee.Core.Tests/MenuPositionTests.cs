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
}
