using System.Text.RegularExpressions;

namespace OnlineClipboard.Services;

public interface ISanitizationService
{
    string Sanitize(string html);
}

public class SanitizationService : ISanitizationService
{
    private static readonly HashSet<string> AllowedTags = new(StringComparer.OrdinalIgnoreCase)
    {
        "p", "br", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "blockquote", "pre", "code", "strong", "em",
        "u", "s", "sub", "sup", "hr", "a"
    };

    private static readonly HashSet<string> AllowedAttributes = new(StringComparer.OrdinalIgnoreCase)
    {
        "href", "title", "target", "rel"
    };

    private static readonly Regex ScriptStyleRegex = new(
        @"<(script|style)[\s\S]*?</\1>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TagRegex = new(
        @"<(\/)?([a-zA-Z0-9]+)([^>]*)>", RegexOptions.Compiled);
    private static readonly Regex AttributeRegex = new(
        @"(\w+)\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))", RegexOptions.Compiled);
    private static readonly Regex EventHandlerRegex = new(@"^on\w+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public string Sanitize(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        html = ScriptStyleRegex.Replace(html, string.Empty);

        var result = TagRegex.Replace(html, m =>
        {
            var closeSlash = m.Groups[1].Value;
            var tagName = m.Groups[2].Value;
            var attrRaw = m.Groups[3].Value;

            if (!AllowedTags.Contains(tagName))
            {
                // Self-closing tag that is disallowed -> drop entirely
                if (closeSlash.Length > 0 || attrRaw.Trim().EndsWith("/"))
                    return string.Empty;
                // Opening disallowed tag -> keep inner content, drop tag
                return closeSlash.Length > 0 ? string.Empty : string.Empty;
            }

            if (closeSlash.Length > 0)
                return $"</{tagName}>";

            var attrs = SanitizeAttributes(attrRaw, tagName);
            var selfClose = attrRaw.Trim().EndsWith("/") ? " " : "";
            return $"<{tagName}{attrs}{selfClose}>";
        });

        return result;
    }

    private static string SanitizeAttributes(string attrRaw, string tagName)
    {
        if (string.IsNullOrWhiteSpace(attrRaw))
            return string.Empty;

        var parts = new List<string>();
        foreach (Match match in AttributeRegex.Matches(attrRaw))
        {
            var name = match.Groups[1].Value;
            var value = match.Groups[3].Value
                ?? match.Groups[4].Value
                ?? match.Groups[5].Value
                ?? string.Empty;

            if (EventHandlerRegex.IsMatch(name))
                continue;
            if (!AllowedAttributes.Contains(name))
                continue;

            var sanitizedValue = value;
            if (name.Equals("href", StringComparison.OrdinalIgnoreCase))
            {
                var lower = value.ToLowerInvariant();
                if (lower.StartsWith("javascript:") || lower.StartsWith("vbscript:") || lower.StartsWith("data:"))
                    continue;
            }

            if (name.Equals("href", StringComparison.OrdinalIgnoreCase))
            {
                var relAlready = parts.Any(p => p.StartsWith("rel=", StringComparison.OrdinalIgnoreCase));
                parts.Add($"href=\"{EscapeAttr(value)}\"");
                if (!relAlready)
                    parts.Add("rel=\"nofollow\"");
            }
            else if (name.Equals("rel", StringComparison.OrdinalIgnoreCase))
            {
                var rel = value;
                if (!rel.Contains("nofollow"))
                    rel = (rel + " nofollow").Trim();
                parts.Add($"rel=\"{EscapeAttr(rel)}\"");
            }
            else
            {
                parts.Add($"{name}=\"{EscapeAttr(value)}\"");
            }
        }

        // Ensure links have rel nofollow
        if (tagName.Equals("a", StringComparison.OrdinalIgnoreCase) &&
            parts.Any(p => p.StartsWith("href=", StringComparison.OrdinalIgnoreCase)) &&
            !parts.Any(p => p.StartsWith("rel=", StringComparison.OrdinalIgnoreCase)))
        {
            parts.Add("rel=\"nofollow\"");
        }

        return parts.Count > 0 ? " " + string.Join(" ", parts) : string.Empty;
    }

    private static string EscapeAttr(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
            .Replace("\"", "&quot;").Replace("'", "&#39;");
}
