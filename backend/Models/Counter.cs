using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace OnlineClipboard.Models;

public class Counter
{
    [BsonId]
    [BsonElement("_id")]
    public string Id { get; set; } = string.Empty;

    [BsonElement("seq")]
    public long Seq { get; set; }
}
