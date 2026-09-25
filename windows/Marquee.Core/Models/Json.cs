using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Marquee.Core.Models;

/// <summary>
/// The one way JSON crosses the wire. Every response is decoded with
/// <see cref="Options"/> and every request body encoded with
/// <see cref="RequestOptions"/>, so a DTO never needs its own attributes for
/// naming, dates or enums: the wire's camelCase key is the C# name in
/// PascalCase, timestamps are <see cref="DateTimeOffset"/>, calendar dates
/// are <see cref="DateOnly"/>, and string unions are open enums.
/// </summary>
public static class Json
{
    /// <summary>
    /// Decoding: camelCase keys, case-sensitive (the contract is exact), nulls
    /// kept (nullable fields are always present on the wire).
    /// </summary>
    public static JsonSerializerOptions Options { get; } = Create(JsonIgnoreCondition.Never);

    /// <summary>
    /// Encoding request bodies. Nulls are left out, which is what the Mac app
    /// sends (Swift's synthesized Encodable skips nil), so an optional field
    /// such as <c>PATCH /users/{id}</c>'s <c>password</c> stays absent rather
    /// than becoming an explicit <c>null</c> the server might act on.
    /// </summary>
    public static JsonSerializerOptions RequestOptions { get; } = Create(JsonIgnoreCondition.WhenWritingNull);

    private static JsonSerializerOptions Create(JsonIgnoreCondition ignore)
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = false,
            DefaultIgnoreCondition = ignore,
            // Wire fields are `init` properties; a get-only property is a
            // computed helper (User.IsAdmin, TitleId.Route) and must never
            // be written into a request body.
            IgnoreReadOnlyProperties = true,
            TypeInfoResolver = new DefaultJsonTypeInfoResolver { Modifiers = { NullIsAMissingKey } },
        };
        options.Converters.Add(new TolerantDateTimeOffsetConverter());
        options.Converters.Add(new DateOnlyConverter());
        options.Converters.Add(new LenientNullableDateOnlyConverter());
        options.Converters.Add(new OpenEnumConverterFactory());
        return options;
    }

    // MARK: Nulls

    /// <summary>
    /// Makes a JSON <c>null</c> on a non-nullable member behave exactly like
    /// a missing key: fatal for a <c>required</c> one, the declared default
    /// for the rest (<c>ServerInfo.Version</c> stays "unknown", a lenient
    /// list stays empty), which is what the Mac's
    /// <c>decodeIfPresent(...) ?? default</c> does.
    ///
    /// Without this, System.Text.Json on .NET 8 checks <c>required</c> for
    /// key presence only and stores the null into a <c>string</c> or a list,
    /// where it surfaces later as a NullReferenceException in whatever view
    /// model reads it, instead of the "couldn't read" error the transport
    /// maps a <see cref="JsonException"/> to. The C# nullable annotations
    /// are the contract's own notation for what the server may leave null,
    /// so they are read back through reflection and enforced on read. A
    /// list's element annotation counts too: <c>IReadOnlyList&lt;string&gt;</c>
    /// refuses a null entry, <c>IReadOnlyList&lt;string?&gt;</c> would keep it.
    /// Value types need none of this, the serializer already refuses null
    /// for a non-nullable struct.
    ///
    /// Reads the annotations with <see cref="NullabilityInfoContext"/>,
    /// which a trimmed publish turns off unless the app sets
    /// <c>NullabilityInfoContextSupport</c>; reflection-based serialization
    /// is not trim-safe either, so nothing new is asked of the app here.
    /// </summary>
    private static void NullIsAMissingKey(JsonTypeInfo typeInfo)
    {
        if (typeInfo.Kind != JsonTypeInfoKind.Object)
        {
            return;
        }
        // Not thread-safe, and the serializer may resolve two types at
        // once, so one context per type rather than a shared one.
        var nullability = new NullabilityInfoContext();
        foreach (var property in typeInfo.Properties)
        {
            if (property.Set is not { } set
                || property.IsExtensionData
                || property.AttributeProvider is not PropertyInfo member
                || member.PropertyType.IsValueType)
            {
                continue;
            }
            var info = nullability.Create(member);
            if (info.WriteState != NullabilityState.NotNull)
            {
                continue;
            }
            var required = property.IsRequired;
            var elementsAreNotNull = HasNonNullableReferenceElements(info);
            var label = $"{typeInfo.Type.Name}.{property.Name}";
            property.Set = (target, value) =>
            {
                if (value == null)
                {
                    if (required)
                    {
                        throw new JsonException($"{label} must not be null.");
                    }
                    return;
                }
                if (elementsAreNotNull)
                {
                    foreach (var element in (IEnumerable)value)
                    {
                        if (element == null)
                        {
                            throw new JsonException($"{label} must not contain null.");
                        }
                    }
                }
                set(target, value);
            };
        }
    }

    /// <summary>A collection whose element type is a reference type declared without <c>?</c>.</summary>
    private static bool HasNonNullableReferenceElements(NullabilityInfo info)
    {
        if (!typeof(IEnumerable).IsAssignableFrom(info.Type))
        {
            return false;
        }
        var element = info.ElementType ?? (info.GenericTypeArguments.Length == 1 ? info.GenericTypeArguments[0] : null);
        return element != null && !element.Type.IsValueType && element.ReadState == NullabilityState.NotNull;
    }

    /// <summary>Decodes a response body; a JSON <c>null</c> at the top level is an error like any other bad body.</summary>
    public static T Decode<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Options) ?? throw new JsonException("Expected a JSON value, got null.");

    /// <inheritdoc cref="Decode{T}(string)"/>
    public static T Decode<T>(ReadOnlySpan<byte> utf8Json) =>
        JsonSerializer.Deserialize<T>(utf8Json, Options) ?? throw new JsonException("Expected a JSON value, got null.");

    /// <summary>
    /// Encodes a request body with <see cref="RequestOptions"/>, using the
    /// runtime type so an <c>object</c>-typed body keeps its fields. Bodies
    /// are declared records (<c>LoginRequest</c>, ...), never anonymous
    /// types: those have get-only properties, which the options skip, so
    /// one would silently go out as <c>{}</c>.
    /// </summary>
    /// <exception cref="NotSupportedException">For an anonymous type.</exception>
    public static byte[] EncodeBody(object body) =>
        JsonSerializer.SerializeToUtf8Bytes(body, RequireDeclaredType(body), RequestOptions);

    /// <inheritdoc cref="EncodeBody(object)"/>
    public static string EncodeBodyToString(object body) =>
        JsonSerializer.Serialize(body, RequireDeclaredType(body), RequestOptions);

    private static Type RequireDeclaredType(object body)
    {
        var type = body.GetType();
        if (type.IsDefined(typeof(CompilerGeneratedAttribute), inherit: false) && type.Name.Contains("AnonymousType", StringComparison.Ordinal))
        {
            throw new NotSupportedException("Request bodies are declared records with init properties, not anonymous types (their get-only properties would not be written).");
        }
        return type;
    }

    // MARK: Dates

    private static readonly string[] TimestampFormats =
    [
        "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFK",
        "yyyy-MM-dd'T'HH:mm:ssK",
    ];

    private const string CalendarDateFormat = "yyyy-MM-dd";

    /// <summary>
    /// <c>2026-09-17T12:00:00.000Z</c> as the contract specifies, tolerating
    /// timestamps without milliseconds and bare <c>YYYY-MM-DD</c> dates (UTC
    /// midnight). Null for anything else.
    /// </summary>
    public static DateTimeOffset? ParseDate(string value)
    {
        const DateTimeStyles styles = DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal;
        if (DateTimeOffset.TryParseExact(value, TimestampFormats, CultureInfo.InvariantCulture, styles, out var timestamp))
        {
            return timestamp;
        }
        if (DateOnly.TryParseExact(value, CalendarDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        {
            return new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        }
        return null;
    }

    /// <summary>ISO-8601 UTC with milliseconds, the contract's timestamp shape.</summary>
    public static string FormatDate(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>
    /// A <c>"YYYY-MM-DD"</c> calendar date, or the date part of a longer ISO
    /// string (the Mac's <c>CalendarDay</c> takes the same prefix). Null for
    /// anything else, including <c>""</c>, which TMDb sends for an unknown date.
    /// </summary>
    public static DateOnly? ParseCalendarDate(string value)
    {
        if (value.Length < CalendarDateFormat.Length)
        {
            return null;
        }
        var head = value.Length == CalendarDateFormat.Length ? value : value[..CalendarDateFormat.Length];
        return DateOnly.TryParseExact(head, CalendarDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ? day : null;
    }

    public static string FormatCalendarDate(DateOnly value) =>
        value.ToString(CalendarDateFormat, CultureInfo.InvariantCulture);
}

/// <summary>Timestamps: strict on write, tolerant on read (see <see cref="Json.ParseDate"/>).</summary>
public sealed class TolerantDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected an ISO-8601 date string, got {reader.TokenType}.");
        }
        var text = reader.GetString()!;
        return Json.ParseDate(text) ?? throw new JsonException($"Expected an ISO-8601 date, got \"{text}\".");
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(Json.FormatDate(value));
}

/// <summary>
/// Calendar dates where the contract says a value is always there (a
/// calendar grid day, a changelog entry): a blank or malformed one fails the
/// response, as it should.
/// </summary>
public sealed class DateOnlyConverter : JsonConverter<DateOnly>
{
    public override DateOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected a YYYY-MM-DD date string, got {reader.TokenType}.");
        }
        var text = reader.GetString()!;
        return Json.ParseCalendarDate(text) ?? throw new JsonException($"Expected a YYYY-MM-DD date, got \"{text}\".");
    }

    public override void Write(Utf8JsonWriter writer, DateOnly value, JsonSerializerOptions options) =>
        writer.WriteStringValue(Json.FormatCalendarDate(value));
}

/// <summary>
/// Optional calendar dates (a release date, a birthday). TMDb sometimes sends
/// <c>""</c> for an unknown date, and one bad date must not take a whole
/// title page down with it, so blank or malformed reads as null rather than
/// failing. Registered for <c>DateOnly?</c> specifically, so a non-nullable
/// <see cref="DateOnly"/> keeps the strict converter.
/// </summary>
public sealed class LenientNullableDateOnlyConverter : JsonConverter<DateOnly?>
{
    public override bool HandleNull => true;

    public override DateOnly? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.Null => null,
            JsonTokenType.String => Json.ParseCalendarDate(reader.GetString()!),
            _ => throw new JsonException($"Expected a YYYY-MM-DD date string or null, got {reader.TokenType}."),
        };

    public override void Write(Utf8JsonWriter writer, DateOnly? value, JsonSerializerOptions options)
    {
        if (value is { } day)
        {
            writer.WriteStringValue(Json.FormatCalendarDate(day));
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
