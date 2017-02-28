//db.images.find().count()
var docs = db.images.aggregate( [ { $project : { cancer_type : 1 , case_id : 1, objective : 1, _id: 0 } } ], { $limit : 1100 } )
printjson(docs.toArray());
