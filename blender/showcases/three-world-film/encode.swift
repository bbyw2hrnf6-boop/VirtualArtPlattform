// Native H.264/AAC web delivery. Run from the repository root on macOS.
// Two exact 20-second variants, each with moov metadata before media payload.
import Foundation
import AVFoundation
import CoreImage
import CoreVideo

let root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath)
let build=root.appendingPathComponent("artifacts/lieuva-homepage-film/20s")
let output=root.appendingPathComponent("public/assets/films")
let duration=CMTime(value:20,timescale:1)
let audioURL=build.appendingPathComponent("original-sound.m4a")
if FileManager.default.fileExists(atPath:audioURL.path){try FileManager.default.removeItem(at:audioURL)}
let audioAsset=AVURLAsset(url:build.appendingPathComponent("original-sound.wav"))
let soundExporter=AVAssetExportSession(asset:audioAsset,presetName:AVAssetExportPresetAppleM4A)!
try await soundExporter.export(to:audioURL,as:.m4a)
let context=CIContext(options:[.cacheIntermediates:false,.useSoftwareRenderer:false])
let colour=CGColorSpace(name:CGColorSpace.sRGB)!
var reports:[[String:Any]]=[]
for (width,height,bitrate,suffix) in [(1920,1080,2_850_000,""),(1280,720,1_350_000,"-720")] {
 let silent=build.appendingPathComponent("silent\(suffix).mp4")
 let final=output.appendingPathComponent("lieuva-three-worlds-20s\(suffix).mp4")
 for url in [silent,final]{if FileManager.default.fileExists(atPath:url.path){try FileManager.default.removeItem(at:url)}}
 let writer=try AVAssetWriter(outputURL:silent,fileType:.mp4)
 let settings:[String:Any]=[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:width,AVVideoHeightKey:height,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:bitrate,AVVideoExpectedSourceFrameRateKey:30,AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel,AVVideoMaxKeyFrameIntervalKey:30]]
 let input=AVAssetWriterInput(mediaType:.video,outputSettings:settings);input.expectsMediaDataInRealTime=false
 let attrs:[String:Any]=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,kCVPixelBufferWidthKey as String:width,kCVPixelBufferHeightKey as String:height,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true]
 let adapter=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:attrs)
 writer.add(input)
 guard writer.startWriting() else{throw writer.error!};writer.startSession(atSourceTime:.zero)
 for i in 0..<600 {
  while !input.isReadyForMoreMediaData {
   if writer.status == .failed{throw writer.error!}
   try await Task.sleep(nanoseconds:2_000_000)
  }
  autoreleasepool {
   let url=build.appendingPathComponent(String(format:"frames/%05d.jpg",i))
   guard var img=CIImage(contentsOf:url,options:[.applyOrientationProperty:true]) else{fatalError("Missing frame \(i)")}
   if width != 1920 {img=img.transformed(by:CGAffineTransform(scaleX:Double(width)/1920.0,y:Double(height)/1080.0))}
   var buffer:CVPixelBuffer?;CVPixelBufferCreate(kCFAllocatorDefault,width,height,kCVPixelFormatType_32BGRA,attrs as CFDictionary,&buffer)
   guard let pb=buffer else{fatalError("Pixel buffer unavailable")}
   context.render(img,to:pb,bounds:CGRect(x:0,y:0,width:width,height:height),colorSpace:colour)
   if !adapter.append(pb,withPresentationTime:CMTime(value:Int64(i),timescale:30)){fatalError("Frame append failed: \(String(describing:writer.error))")}
  }
  if i%300==0{print("\(height)p encoded \(i)/600")}
 }
 input.markAsFinished();writer.endSession(atSourceTime:duration)
 await withCheckedContinuation{(c:CheckedContinuation<Void,Never>) in writer.finishWriting{c.resume()}}
 guard writer.status == .completed else{throw writer.error!}
 let vAsset=AVURLAsset(url:silent);let aAsset=AVURLAsset(url:audioURL)
 let vt=try await vAsset.loadTracks(withMediaType:.video).first!
 let at=try await aAsset.loadTracks(withMediaType:.audio).first!
 let composition=AVMutableComposition();let range=CMTimeRange(start:.zero,duration:duration)
 try composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!.insertTimeRange(range,of:vt,at:.zero)
 try composition.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid)!.insertTimeRange(range,of:at,at:.zero)
 let exporter=AVAssetExportSession(asset:composition,presetName:AVAssetExportPresetPassthrough)!
 exporter.shouldOptimizeForNetworkUse=true
 try await exporter.export(to:final,as:.mp4)
 let asset=AVURLAsset(url:final);let actualDuration=try await asset.load(.duration)
 let track=try await asset.loadTracks(withMediaType:.video).first!
 let size=try await track.load(.naturalSize);let fps=try await track.load(.nominalFrameRate)
 let audioTracks=try await asset.loadTracks(withMediaType:.audio)
 let bytes=(try FileManager.default.attributesOfItem(atPath:final.path)[.size] as! NSNumber).intValue
 let report:[String:Any]=["path":"public/assets/films/\(final.lastPathComponent)","durationSeconds":CMTimeGetSeconds(actualDuration),"width":Int(size.width),"height":Int(size.height),"fps":fps,"audioTracks":audioTracks.count,"bytes":bytes,"requestedVideoBitrate":bitrate,"videoCodec":"H.264","audioCodec":"AAC","fastStartRequested":true]
 reports.append(report)
 print("COMPLETE \(final.path): \(CMTimeGetSeconds(actualDuration)) sec, \(size), \(bytes) bytes")
}
let data=try JSONSerialization.data(withJSONObject:reports,options:[.prettyPrinted,.sortedKeys])
try data.write(to:root.appendingPathComponent("blender/showcases/three-world-film/delivery-report.json"))
