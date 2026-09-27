using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

/// <summary>
/// <c>GET /me</c>'s <c>language</c> (0.50+), present: the account's chosen
/// language (<c>en</c>, <c>es</c>, <c>fr</c>, <c>de</c>, <c>pt-BR</c>), or
/// a null <see cref="Code"/> to follow the device. Wrapped so that "the
/// server sent null" (Automatic) stays apart from "the server sent nothing"
/// (an older server: no picker), which a plain <c>string?</c> can't tell.
/// </summary>
[JsonConverter(typeof(AccountLanguageConverter))]
public sealed record AccountLanguage(string? Code);

/// <summary>Reads a JSON string or null into an <see cref="AccountLanguage"/>; a missing key never gets here.</summary>
public sealed class AccountLanguageConverter : JsonConverter<AccountLanguage>
{
    /// <summary>A JSON null is a value here (Automatic), not the absence of one.</summary>
    public override bool HandleNull => true;

    public override AccountLanguage Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.Null => new AccountLanguage(null),
            JsonTokenType.String => new AccountLanguage(reader.GetString()),
            _ => throw new JsonException($"Expected a string or null for language, got {reader.TokenType}."),
        };

    public override void Write(Utf8JsonWriter writer, AccountLanguage value, JsonSerializerOptions options)
    {
        if (value.Code is { } code)
        {
            writer.WriteStringValue(code);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}

/// <summary>
/// <c>PATCH /me</c> (0.50+): the account's own preferences. The language is
/// always written, null included (null means "follow the device again"),
/// unlike other request bodies, which leave nulls out.
/// </summary>
public sealed record UpdateMeRequest(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Language);
