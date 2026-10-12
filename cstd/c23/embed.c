/* #embed */

static const unsigned char data[] = {
#embed "embed.bin"
};

int probe(void)
{
	return sizeof data == 4 && data[0] == 'z' && data[3] == '!';
}
