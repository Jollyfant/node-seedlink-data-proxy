/* Class Header
 *
 * Container for the fixed header section
 */
function Header(data) {

  this.sequenceNumber = data.toString("ascii", 0, 6);
  this.dataQuality = data.toString("ascii", 6, 7);

  this.encoding = null;
  this.byteOrder = null;
  this.timingQuality = null;
  this.microSeconds = null
  this.recordLength = null;
  this.sampleRate = null;
  this.nFrames = null;
  this.nBlockettes = data.readUInt8(39);

  /* Read the blockette chain and set values [blockette]
   * > sample rate [500]
   * > encoding [1000]
   * > byte order [1000]
   * > record length [1000]
   * > number of data frames [1001]
   * > micro seconds [1001]
   */
  this.ReadBlocketteChain(data);

  // Only do big endian
  if(!this.byteOrder) {
    throw("Little endian byte order not supported.");
  }

  this.nSamples = data.readUInt16BE(30);

  // Read the sample rate if unset by blockette 500
  if(this.sampleRate === null) {
    this.sampleRate = this.ReadSampleRate(data);
  }

  // Read the mSEED header bit flags
  this.ReadBitFlags(data);

  this.timingCorrection = data.readInt32BE(40);

  this.ReadRecordStart(data);

  this.end = this.start + 1E3 * (this.nSamples / this.sampleRate);

  this.SetStreamId(data);

}

/* Function Header.ReadSampleRate
 *
 * Calculates the sample rate from the multiplication factor
 */
Header.prototype.ReadSampleRate = function(data) {

  var sampleRateFactor = data.readInt16BE(32);
  var sampleRateMult = data.readInt16BE(34);

  // Calculate the sample rate from the factor and multiplier
  if(sampleRateFactor > 0 && sampleRateMult > 0) {
    return sampleRateMult * sampleRateFactor;
  } else if(sampleRateFactor > 0 && sampleRateMult < 0) {
    return -sampleRateFactor / sampleRateMult;
  } else if(sampleRateFactor < 0 && sampleRateMult > 0) {
    return -sampleRateMult / sampleRateFactor;
  } else if(sampleRateFactor < 0 && sampleRateMult < 0) {
    return 1 / (sampleRateFactor * sampleRateMult);
  }

  return null;

}

/* Function Header.ReadBitFlags
 * 
 * Reads the mSEED header bit-flags
 *
 */
Header.prototype.ReadBitFlags = function(data) {

  this.flags = {
    "activity": data.readUInt8(36),
    "clock": data.readUInt8(37),
    "quality": data.readUInt8(38)
  }

}

/* Function Header.ReadBlocketteChain
 *
 * Reads the mSEED blockette chain and sets values
 */
Header.prototype.ReadBlocketteChain = function(data) {

  var blocketteStart = data.readUInt16BE(46);
  var blockette;
  var blocketteCounter = 0;

  // Run over the blockette chain
  while(blocketteStart) {

    blocketteCounter++;

    blockette = data.readUInt16BE(blocketteStart);

    switch(blockette) {

      // Case of blockette 1000
      case 1000:
        this.encoding = data.readUInt8(blocketteStart + 4);
        this.byteOrder = data.readUInt8(blocketteStart + 5);
        this.recordLength = 1 << data.readUInt8(blocketteStart + 6);
        break;

      // Blockette 1001: read the microseconds and number of data frames
      case 1001:
        this.timingQuality = data.readUInt8(blocketteStart + 4);
        this.microSeconds = data.readInt8(blocketteStart + 5);
        this.nFrames = data.readUInt8(blocketteStart + 7);
        break;

      // Blockette 100: read the overruling sample rate
      case 100:
        this.sampleRate = data.readFloatBE(blocketteStart + 4);
        break;
    }

    blocketteStart = data.readUInt16BE(blocketteStart + 2);

  }

  // Sanity check on the number of blockettes
  if(blocketteCounter !== this.nBlockettes) {
    throw("Number of blockettes does not match number encountered.");
  }

}

/* Function Header.SetStreamId
 *
 * Reads and sets stream parameters
 * according to the mSEED Manual
 */
Header.prototype.SetStreamId = function(data) {

  // Read the stream identifiers and trim
  // any padded white spaces
  this.station = data.toString("ascii", 8, 13).trim();
  this.location = data.toString("ascii", 13, 15).trim();
  this.channel = data.toString("ascii", 15, 18).trim();
  this.network = data.toString("ascii", 18, 20).trim();

}

/* Function Header.ReadRecordStart
 *
 * Reads record starttime from BTIME encoding
 * according to the mSEED Manual
 */
Header.prototype.ReadRecordStart = function(data) {

  // Get the record starttime truncated to miliseconds
  // I don't really care about sub-milisecond precision
  this.start = new Date(
    data.readUInt16BE(20), 
    0,
    1,
    data.readUInt8(24),
    data.readUInt8(25),
    data.readUInt8(26),
    (1E-1 * data.readUInt16BE(28)) | 0
  ).setDate(data.readUInt16BE(22));

  // Apply timing correction (0.0001 seconds)
  // We only have milisecond precision
  if(!(this.flags.activity & 2)) {
    this.start = this.start + ((1E-1 * this.timingCorrection) | 0)
  }

}

module.exports = Header;
